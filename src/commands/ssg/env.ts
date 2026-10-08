import type { Hono } from 'hono'

/**
 * `toSSG` passes its own env (the SSG context) to the app. Add the
 * bindings to it, so `c.env` has them while the pages are generated.
 */
export const withBindings = (app: Hono, bindings: Record<string, unknown>): Hono => {
  const { request, fetch } = app
  app.fetch = (req, env, ctx) => fetch(req, Object.assign({}, bindings, env), ctx)
  app.request = (input, init, env, ctx) =>
    request(input, init, Object.assign({}, bindings, env), ctx)
  return app
}
