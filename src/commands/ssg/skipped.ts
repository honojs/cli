import type { Hono } from 'hono'

export interface SkippedPage {
  path: string
  status: number
}

/**
 * `toSSG` skips a page that does not answer 200 without saying so.
 * Record the path and status of each one.
 */
export const trackSkipped = (app: Hono) => {
  const paths = new WeakMap<Response, string>()
  const skipped: SkippedPage[] = []
  const { request } = app
  app.request = async (input, init, env, ctx) => {
    const res = await request(input, init, env, ctx)
    paths.set(
      res,
      typeof input === 'string'
        ? input
        : new URL(input instanceof Request ? input.url : input).pathname
    )
    return res
  }
  const afterResponseHook = (res: Response): Response => {
    if (res.status !== 200) {
      skipped.push({ path: paths.get(res) ?? '', status: res.status })
    }
    return res
  }
  return { app, afterResponseHook, skipped }
}
