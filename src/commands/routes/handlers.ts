import type { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

export type HandlerSource = 'custom' | 'default' | 'unknown'

export interface Handlers {
  notFound: HandlerSource
  onError: HandlerSource
}

// `errorHandler` is public at runtime but private in the types.
const readErrorHandler = (instance: unknown): unknown =>
  (instance as { errorHandler?: unknown }).errorHandler

/**
 * Report whether the app sets its own notFound and onError handlers.
 * A route diff misses them, so `routes` reports them directly.
 */
export const inspectHandlers = async (app: Hono): Promise<Handlers> => {
  // A fresh instance of the same class holds the default errorHandler,
  // so compare references.
  let onError: HandlerSource = 'unknown'
  try {
    const AppClass = app.constructor as new () => unknown
    onError = readErrorHandler(app) === readErrorHandler(new AppClass()) ? 'default' : 'custom'
  } catch {
    // a constructor that needs arguments
  }

  // The notFound handler is a private field. Probe a path that cannot
  // match a real route, and compare to the default 404 response.
  const response = await app.request(`/__hono_cli_probe__/${randomUUID()}`)
  let notFound: HandlerSource
  if (response.status !== 404) {
    // A wildcard route or a middleware answered instead
    notFound = 'unknown'
  } else {
    notFound = (await response.text()) === '404 Not Found' ? 'default' : 'custom'
  }

  return { notFound, onError }
}
