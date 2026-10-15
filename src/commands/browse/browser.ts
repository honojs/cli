import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as HappyDomModule from 'happy-dom'
import type { Browser, BrowserWindow, Document, Element, Response as DomResponse } from 'happy-dom'
import { CliError } from '../../utils/output.js'
import type { RequestTarget } from '../../utils/target.js'

type HappyDom = typeof HappyDomModule

export interface BrowseAction {
  type: 'fill' | 'click'
  /** A field name for fill, a CSS selector for click */
  target: string
  value?: string
}

export interface BrowseResult {
  url: string
  title: string
  text: string
  forms: { action: string; method: string; fields: Record<string, string> }[]
  console: { type: string; text: string }[]
  actions: { action: string; ok: boolean; error?: string }[]
  note: string
}

const ORIGIN = 'http://localhost'
const TEXT_LIMIT = 2000
const SETTLE_MS = 300
const TIMEOUT_MS = 15000

/**
 * happy-dom is not a dependency of Hono CLI. It resolves from the
 * user's project, like vite, so only `browse` pays for it.
 */
export const loadHappyDom = async (): Promise<HappyDom> => {
  const require = createRequire(join(process.cwd(), 'package.json'))
  let resolved: string
  try {
    resolved = require.resolve('happy-dom')
  } catch {
    throw new CliError('HAPPY_DOM_NOT_FOUND', 'happy-dom is not installed in this project', {
      suggestions: ['Install it: npm install -D happy-dom'],
      docs: 'https://github.com/capricorn86/happy-dom',
    })
  }
  return import(pathToFileURL(resolved).href)
}

/**
 * happy-dom's module loader fails on some regex literals (e.g. a "/"
 * in a character class). `new RegExp()` is the same regex and avoids it.
 */
export const rewriteRegexLiterals = async (code: string): Promise<string> => {
  // Loaded only here: the parser is large, and no other command needs it
  const { parse } = await import('@babel/parser')
  let ast: unknown
  try {
    ast = parse(code, { sourceType: 'module', errorRecovery: false })
  } catch {
    return code
  }
  const found: { start: number; end: number; pattern: string; flags: string }[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object' || node === null) {
      return
    }
    const n = node as Record<string, unknown>
    if (n.type === 'RegExpLiteral' && typeof n.start === 'number' && typeof n.end === 'number') {
      found.push({
        start: n.start,
        end: n.end,
        pattern: String(n.pattern),
        flags: String(n.flags),
      })
      return
    }
    for (const [key, value] of Object.entries(n)) {
      if (key !== 'loc' && key !== 'extra' && typeof value === 'object') {
        walk(value)
      }
    }
  }
  walk(ast)
  let out = code
  for (const r of found.sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, r.start)}(new RegExp(${JSON.stringify(r.pattern)}, ${JSON.stringify(r.flags)}))${out.slice(r.end)}`
  }
  return out
}

/**
 * Vite's client opens a WebSocket for HMR, which a one-shot run does not
 * need. This stub keeps its exports, so the modules that import it load.
 */
const VITE_CLIENT_STUB = `
const hot = { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, decline() {}, on() {}, off() {}, send() {} }
export const createHotContext = () => hot
export const injectQuery = (url) => url
export class ErrorOverlay {}
export const updateStyle = (id, css) => {
  let style = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`)
  if (!style) {
    style = document.createElement('style')
    style.setAttribute('data-vite-dev-id', id)
    document.head.appendChild(style)
  }
  style.textContent = css
}
export const removeStyle = (id) => document.querySelector(\`style[data-vite-dev-id="\${id}"]\`)?.remove()
`

type Field = Element & { value: string; type?: string; checked?: boolean }

const FIELDS = 'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select'

const textOf = (el: Element, skip: string): string => {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll(skip).forEach((child) => child.remove())
  // Keep the words of two elements apart, as the page shows them
  copy.querySelectorAll('*').forEach((child) => child.append(' '))
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** The names a person or agent may call a field by */
const namesOf = (el: Element): string[] => {
  const label =
    el.closest('label') ?? (el.id ? el.ownerDocument.querySelector(`label[for="${el.id}"]`) : null)
  return [
    el.getAttribute('name'),
    label ? textOf(label, 'input, textarea, select, button') : null,
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.id,
  ].filter((name): name is string => !!name)
}

/** A field by its name, label, placeholder, aria-label, or id, else a CSS selector */
const findField = (doc: Document, key: string): Field | null => {
  const found = [...doc.querySelectorAll(FIELDS)].find((el) => namesOf(el).includes(key))
  if (found) {
    return found as Field
  }
  try {
    return doc.querySelector(key) as Field | null
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Load the page in happy-dom, with every request the page makes sent
 * to the target (the app, Vite, or workerd), then run the actions in
 * order and report what the page shows.
 */
export const browse = async (
  happyDom: HappyDom,
  target: RequestTarget,
  path: string,
  actions: BrowseAction[],
  sharedHeaders: Record<string, string> = {},
  env?: unknown
): Promise<BrowseResult> => {
  const consoleLog: BrowseResult['console'] = []
  const log =
    (type: string) =>
    (...args: unknown[]) => {
      consoleLog.push({ type, text: args.map(String).join(' ') })
    }
  let inflight = 0
  let lastActivity = Date.now()

  const send = (url: string, method: string, headers: Headers, body?: ArrayBuffer) =>
    target.request(new Request(url, { method, headers, body, redirect: 'manual' }), undefined, env)

  /** Send a request of the page, and follow redirects like a browser */
  const toTarget = async (request: {
    url: string
    method: string
    redirect: string
    headers: Iterable<[string, string]>
    arrayBuffer(): Promise<ArrayBuffer>
  }): Promise<{ response: Response; url: string }> => {
    const headers = new Headers(sharedHeaders)
    for (const [key, value] of request.headers) {
      headers.set(key, value)
    }
    let method = request.method
    let body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer()
    let url = request.url
    let response = await send(url, method, headers, body)
    for (let i = 0; i < 10 && request.redirect === 'follow'; i++) {
      const location = response.headers.get('location')
      if (response.status < 300 || response.status >= 400 || !location) {
        break
      }
      url = new URL(location, url).href
      if (new URL(url).origin !== ORIGIN) {
        break
      }
      // 307 and 308 keep the method and body; the others turn into GET
      if (response.status !== 307 && response.status !== 308) {
        method = 'GET'
        body = undefined
        headers.delete('content-type')
      }
      response = await send(url, method, headers, body)
    }
    return { response, url }
  }

  const browser: Browser = new happyDom.Browser({
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      navigation: { disableChildPageNavigation: true },
      fetch: {
        interceptor: {
          beforeAsyncRequest: async ({ request, window }) => {
            if (new URL(request.url).origin !== ORIGIN) {
              // Only the app runs here: happy-dom is not a sandbox
              return new window.Response('', { status: 403 })
            }
            if (new URL(request.url).pathname === '/@vite/client') {
              return new window.Response(VITE_CLIENT_STUB, {
                headers: { 'content-type': 'text/javascript' },
              })
            }
            inflight++
            try {
              const { response, url } = await toTarget(request)
              const type = response.headers.get('content-type') ?? ''
              const body = type.includes('javascript')
                ? await rewriteRegexLiterals(await response.text())
                : await response.arrayBuffer()
              const headers = new window.Headers()
              response.headers.forEach((value, key) => headers.append(key, value))
              headers.delete('content-length')
              const result = new window.Response(
                response.status === 204 || response.status === 304 ? null : body,
                { status: response.status, statusText: response.statusText, headers }
              ) as DomResponse
              // The page reads the final URL, e.g. to show it in the address bar
              Object.defineProperties(result, {
                url: { value: url },
                redirected: { value: url !== request.url },
              })
              return result
            } finally {
              inflight--
              lastActivity = Date.now()
            }
          },
        },
      },
    },
    console: {
      ...console,
      log: log('log'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      debug: () => {},
    } as unknown as Console,
  })

  // An error the page does not catch is a fact about the page, not a crash of the CLI
  const onPageError = (error: unknown) => {
    consoleLog.push({
      type: 'error',
      text: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
  }
  process.on('unhandledRejection', onPageError)
  process.on('uncaughtException', onPageError)

  const page = browser.newPage()
  const window = (): BrowserWindow => {
    const win = page.mainFrame.window
    // No human to answer a dialog: accept it
    Object.assign(win, { confirm: () => true, alert: () => {}, prompt: () => null })
    return win
  }
  // The page is quiet when no request is open for a while
  const settle = async () => {
    const end = Date.now() + TIMEOUT_MS
    while (Date.now() < end) {
      await sleep(50)
      if (inflight === 0 && Date.now() - lastActivity >= SETTLE_MS) {
        return
      }
    }
  }

  const results: BrowseResult['actions'] = []
  try {
    await page.goto(`${ORIGIN}${path}`)
    window()
    await settle()

    for (const action of actions) {
      const label = `${action.type} ${action.target}${action.value === undefined ? '' : `=${action.value}`}`
      const win = window()
      const doc = win.document
      if (action.type === 'fill') {
        const el = findField(doc, action.target)
        if (!el) {
          results.push({
            action: label,
            ok: false,
            error: `No field called ${action.target}. Use a name, label, placeholder, or CSS selector from "forms"`,
          })
          break
        }
        // React tracks the value, so set it like a user does
        const proto = Object.getPrototypeOf(el) as object
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, action.value ?? '')
        el.dispatchEvent(new win.Event('input', { bubbles: true }))
        el.dispatchEvent(new win.Event('change', { bubbles: true }))
      } else {
        const el = doc.querySelector(action.target)
        if (!el) {
          results.push({ action: label, ok: false, error: `Nothing matches ${action.target}` })
          break
        }
        ;(el as unknown as { click(): void }).click()
      }
      lastActivity = Date.now()
      await settle()
      results.push({ action: label, ok: true })
    }

    const win = window()
    const doc = win.document
    const text = doc.body ? textOf(doc.body, 'script, style, noscript, template') : ''
    return {
      url: win.location.pathname + win.location.search,
      title: doc.title,
      text: text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text,
      forms: [...doc.querySelectorAll('form')].map((form) => {
        const fields: Record<string, string> = {}
        for (const el of form.querySelectorAll(FIELDS)) {
          const field = el as Field
          if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) {
            continue
          }
          fields[namesOf(el)[0] ?? el.tagName.toLowerCase()] = field.value
        }
        const action = form.getAttribute('action') ?? ''
        return {
          // React puts a placeholder here when a function handles the submit
          action: action.startsWith('javascript:') ? '' : action,
          method: (form.getAttribute('method') ?? 'get').toUpperCase(),
          fields,
        }
      }),
      console: consoleLog,
      actions: results,
      note: 'happy-dom runs the page JS but has no layout or CSS. Confirm visual details in a real browser.',
    }
  } finally {
    await browser.close()
    process.off('unhandledRejection', onPageError)
    process.off('uncaughtException', onPageError)
  }
}
