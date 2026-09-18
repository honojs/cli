import type { Hono } from 'hono'
import { inspectRoutes } from 'hono/dev'
import type { RequestTarget } from '../../utils/target.js'

/**
 * Print the current behavior of the app as batch JSONL lines, to
 * stdout — no file. Parameterless GET routes are executed and their
 * actual status and body become the `expect`. Other routes are
 * printed without an `expect`, for the caller to fill in. One probe
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
  const lines: string[] = []
  const routes = inspectRoutes(app).filter((route) => !route.isMiddleware)

  for (const route of routes) {
    const isParamless = !route.path.includes(':') && !route.path.includes('*')
    if (route.method === 'GET' && isParamless) {
      const captured = await capture(target, route.path, env)
      const expect = statusOnly ? { status: captured.status } : captured
      lines.push(JSON.stringify({ path: route.path, expect }))
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
      expect: await capture(target, '/__no_such_path__', env),
    })
  )

  return lines
}

const capture = async (
  target: RequestTarget,
  path: string,
  env?: Record<string, unknown>
): Promise<{ status: number; body?: unknown }> => {
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
  return { status: response.status, ...(text === '' ? {} : { body }) }
}
