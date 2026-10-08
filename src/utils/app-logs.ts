import type { Hono } from 'hono'

let depth = 0
let saved: Pick<Console, 'log' | 'info' | 'debug'> | undefined

/**
 * Send `console.log`, `info`, and `debug` to stderr while `fn` runs, so
 * logs from the app (e.g. `logger()`) do not break the JSON on stdout.
 */
export const logsToStderr = async <T>(fn: () => T | Promise<T>): Promise<T> => {
  if (depth++ === 0) {
    saved = { log: console.log, info: console.info, debug: console.debug }
    console.log = console.info = console.debug = console.error
  }
  try {
    return await fn()
  } finally {
    if (--depth === 0 && saved) {
      Object.assign(console, saved)
    }
  }
}

/**
 * Make the app's `request` and `fetch` send its logs to stderr.
 */
export const appLogsToStderr = (app: Hono): Hono => {
  const { request, fetch } = app
  app.request = (...args) => logsToStderr(() => request(...args))
  app.fetch = (...args) => logsToStderr(() => fetch(...args))
  return app
}
