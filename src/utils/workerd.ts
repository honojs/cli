import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError } from './output.js'
import type { RequestTarget } from './target.js'

export interface WorkerdRequest {
  path: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface WorkerdResult {
  status: number
  headers: Record<string, string>
  body: string
  response: Response
}

export interface StartedWorker {
  fetch(url: string, init?: RequestInit): Promise<Response>
  dispose(): Promise<void>
}

interface WranglerModule {
  unstable_startWorker(options: {
    config: string
    dev: { logLevel: 'error' }
  }): Promise<StartedWorker>
  unstable_readConfig(args: { config: string }): { main?: string }
}

/**
 * A running workerd. `request` sends one request and keeps the worker
 * up, so many steps share one start. Callers must `dispose`.
 */
export interface WorkerdTarget extends RequestTarget {
  request(input: Request): Promise<Response>
  fetch(request: WorkerdRequest): Promise<WorkerdResult>
  dispose(): Promise<void>
}

const CONFIG_CANDIDATES = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']

export const findWranglerConfig = (): string | undefined =>
  CONFIG_CANDIDATES.find((file) => existsSync(join(process.cwd(), file)))

const requireWranglerConfig = (): string => {
  const config = findWranglerConfig()
  if (!config) {
    throw new CliError('WRANGLER_CONFIG_NOT_FOUND', 'No wrangler config found', {
      suggestions: ['Create wrangler.jsonc with a main entry'],
      docs: 'https://developers.cloudflare.com/workers/wrangler/configuration/',
    })
  }
  return config
}

/**
 * wrangler is not a dependency of Hono CLI. It resolves from the user's
 * project, which has it when the app targets Cloudflare.
 */
const loadWrangler = async (): Promise<WranglerModule> => {
  const require = createRequire(join(process.cwd(), 'package.json'))
  let resolved: string
  try {
    resolved = require.resolve('wrangler')
  } catch {
    throw new CliError('WRANGLER_NOT_FOUND', 'wrangler is not installed in this project', {
      suggestions: ['Install it: npm install -D wrangler'],
      docs: 'https://developers.cloudflare.com/workers/wrangler/',
    })
  }
  return import(pathToFileURL(resolved).href)
}

const TIMEOUT_MS = 10000

const toUrl = (path: string): string =>
  `http://localhost${path.startsWith('/') ? path : `/${path}`}`

/**
 * Wrap a started worker as a target. The first fetch has a timeout:
 * when the runtime fails to start, `worker.fetch()` hangs and only
 * `dispose()` rejects with the root cause.
 */
export const workerdTarget = (worker: StartedWorker, timeoutMs = TIMEOUT_MS): WorkerdTarget => {
  let first = true
  let disposed = false

  const dispose = async () => {
    if (disposed) {
      return
    }
    disposed = true
    await worker.dispose()
  }

  const send = async (url: string, init: RequestInit): Promise<Response> => {
    if (!first) {
      return worker.fetch(url, init)
    }
    first = false
    let timeoutId: NodeJS.Timeout | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new CliError('RUNTIME_FAILED', `No response from workerd in ${timeoutMs / 1000}s`))
        }, timeoutMs)
      })
      return await Promise.race([worker.fetch(url, init), timeout])
    } catch (error) {
      const cause = await dispose().then(
        () => undefined,
        (disposeError: unknown) => disposeError
      )
      if (error instanceof CliError && cause instanceof Error) {
        throw new CliError('RUNTIME_FAILED', `The app failed on workerd: ${cause.message}`, {
          suggestions: ['Check the wrangler config and the error above'],
        })
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    async request(input: Request) {
      const { pathname, search } = new URL(input.url)
      const headers: Record<string, string> = {}
      input.headers.forEach((value, key) => {
        headers[key] = value
      })
      const hasBody = input.method !== 'GET' && input.method !== 'HEAD'
      return send(toUrl(pathname + search), {
        method: input.method,
        headers,
        ...(hasBody ? { body: await input.arrayBuffer() } : {}),
      })
    },
    async fetch(request: WorkerdRequest) {
      const response = await send(toUrl(request.path), {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
      })
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })
      const buffer = await response.clone().arrayBuffer()
      return {
        status: response.status,
        headers,
        body: new TextDecoder().decode(buffer),
        response,
      }
    },
    dispose,
  }
}

/**
 * Start the app from the wrangler config inside workerd.
 */
export const startWorkerd = async (): Promise<WorkerdTarget> => {
  const config = requireWranglerConfig()
  const { unstable_startWorker } = await loadWrangler()
  const worker = await unstable_startWorker({ config, dev: { logLevel: 'error' } })
  return workerdTarget(worker)
}

/**
 * The `main` entry from the wrangler config, as an absolute path.
 * `snapshot --runtime workerd` reads the routes from it in-process.
 */
export const readWorkerdMain = async (): Promise<string> => {
  const config = requireWranglerConfig()
  const { unstable_readConfig } = await loadWrangler()
  const { main } = unstable_readConfig({ config: join(process.cwd(), config) })
  if (!main) {
    throw new CliError('WRANGLER_CONFIG_NOT_FOUND', `No main entry in ${config}`, {
      suggestions: ['Set main in the wrangler config, e.g. "main": "src/index.ts"'],
      docs: 'https://developers.cloudflare.com/workers/wrangler/configuration/',
    })
  }
  return isAbsolute(main) ? main : resolve(process.cwd(), main)
}

export const runOnWorkerd = async (request: WorkerdRequest): Promise<WorkerdResult> => {
  const target = await startWorkerd()
  try {
    return await target.fetch(request)
  } finally {
    await target.dispose().catch(() => {})
  }
}
