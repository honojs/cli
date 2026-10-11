import type { Hono } from 'hono'
import { inspectRoutes } from 'hono/dev'
import type { RequestTarget } from '../../utils/target.js'
import type { Values } from './samples.js'
import { collectValues, isParamRoute, linksIn, samplePath } from './samples.js'

/**
 * Print the current behavior of the app as batch JSONL lines, to
 * stdout — no file. Parameterless GET routes are executed and their
 * actual status and body become the `expect`. A param GET route is
 * executed too when the app showed a path for it (a link, or a JSON
 * field with the param's name). Other routes are printed without an
 * `expect`, for the caller to fill in. One probe
 * line records the current not-found behavior as a fact. The routes
 * come from the app; the requests go to `target` (the app itself, or
 * a running workerd).
 */
export const snapshotLines = async (
  app: Hono,
  statusOnly = false,
  env?: Record<string, unknown>,
  target: RequestTarget = app
): Promise<string[]> => {
  // Hono v5 lists notFound and onError handlers with a method like
  // "@NOT_FOUND". They are not routes to request.
  const routes = inspectRoutes(app).filter(
    (route) => !route.isMiddleware && !route.method.startsWith('@')
  )
  const captured = new Map<string, Captured>()
  const links: string[] = []
  const values: Values = new Map()
  const record = async (path: string) => {
    const response = await capture(target, path, env)
    captured.set(path, response)
    links.push(...linksIn(response.text))
    collectValues(response.body, values)
  }

  for (const route of routes) {
    const isParamless = !route.path.includes(':') && !route.path.includes('*')
    if (route.method === 'GET' && isParamless && !captured.has(route.path)) {
      await record(route.path)
    }
  }

  // Param GET routes: follow what the app showed, round by round, since
  // a sampled page can link to the next one (/tags -> /tags/a -> /posts/b)
  const samples = new Map<string, string>()
  const paramRoutes = routes.filter((r) => r.method === 'GET' && isParamRoute(r.path))
  let found = true
  while (found) {
    found = false
    for (const route of paramRoutes) {
      if (samples.has(route.path)) {
        continue
      }
      const path = samplePath(route.path, links, values, new Set(captured.keys()))
      if (path) {
        samples.set(route.path, path)
        await record(path)
        found = true
      }
    }
  }

  const lines: string[] = []
  const expectOf = (path: string) => {
    const { status, body } = captured.get(path) as Captured
    return statusOnly ? { status } : { status, ...(body === undefined ? {} : { body }) }
  }
  for (const route of routes) {
    const sample = route.method === 'GET' ? (samples.get(route.path) ?? route.path) : undefined
    if (sample && captured.has(sample)) {
      lines.push(JSON.stringify({ path: sample, expect: expectOf(sample) }))
    } else {
      const method = route.method === 'GET' ? {} : { method: route.method }
      lines.push(JSON.stringify({ ...method, path: route.path }))
    }
  }

  // The probe keeps its body even with --status-only: a dropped
  // notFound handler still answers 404, only the body changes.
  lines.push(
    JSON.stringify({
      path: '/__no_such_path__',
      expect: await capture(target, '/__no_such_path__', env).then(({ status, body }) => ({
        status,
        ...(body === undefined ? {} : { body }),
      })),
    })
  )

  return lines
}

interface Captured {
  status: number
  body?: unknown
  text: string
}

const capture = async (
  target: RequestTarget,
  path: string,
  env?: Record<string, unknown>
): Promise<Captured> => {
  const response = await target.request(
    new Request(new URL(path, 'http://localhost').href),
    undefined,
    env
  )
  const text = await response.text()
  const isJson = response.headers.get('content-type')?.includes('json')
  let body: unknown = text
  if (isJson) {
    try {
      body = JSON.parse(text)
    } catch {
      // keep the text
    }
  }
  return { status: response.status, text, ...(text === '' ? {} : { body }) }
}
