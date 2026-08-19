import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { RouterRoute } from 'hono/types'
import { findTargetHandler, isMiddleware } from 'hono/utils/handler'

export interface TraceEntry {
  method: string
  path: string
  name: string
  isMiddleware: boolean
  responded?: boolean
}

interface Matched {
  routes: RouterRoute[]
  index: number
  status: number
}

/**
 * Wrap the app with a tracer middleware. `getTrace()` returns the
 * routes matched by the last request, with `responded` on the route
 * that returned the response.
 */
export const withTracer = (app: Hono): { app: Hono; getTrace: () => TraceEntry[] } => {
  let matched: Matched | undefined
  const tracer: MiddlewareHandler = async (c, next) => {
    await next()
    matched = { routes: c.req.matchedRoutes, index: c.req.routeIndex, status: c.res.status }
  }
  const wrapper = new Hono()
  wrapper.use(tracer)
  wrapper.route('/', app)
  return { app: wrapper, getTrace: () => formatTrace(matched, tracer) }
}

const formatTrace = (matched: Matched | undefined, tracer: MiddlewareHandler): TraceEntry[] => {
  if (!matched) {
    return []
  }
  return matched.routes
    .map((route, index) => {
      const target = findTargetHandler(route.handler)
      const middleware = isMiddleware(target)
      // A 404 response comes from the notFound handler, which is not in
      // matchedRoutes. routeIndex then points at the last middleware, so
      // do not mark it as responded.
      const responded = index === matched.index && !(middleware && matched.status === 404)
      return { route, target, middleware, responded }
    })
    .filter(({ route }) => route.handler !== tracer)
    .map(({ route, target, middleware, responded }) => ({
      method: route.method,
      path: route.path,
      name: target.name || (middleware ? '[middleware]' : '[handler]'),
      isMiddleware: middleware,
      ...(responded ? { responded: true } : {}),
    }))
}
