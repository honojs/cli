import { Hono } from 'hono'
import { describe, it, expect } from 'vitest'
import { withTracer } from './trace'

describe('withTracer', () => {
  it('should mark the handler that responded', async () => {
    const app = new Hono()
    app.use(async function auth(_c, next) {
      await next()
    })
    app.get('/api/users/:id', function getUser(c) {
      return c.json({ id: c.req.param('id') })
    })

    const { app: traced, getTrace } = withTracer(app)
    const res = await traced.request('http://localhost/api/users/123')

    expect(res.status).toBe(200)
    expect(getTrace()).toEqual([
      { method: 'ALL', path: '/*', name: 'auth', isMiddleware: true },
      {
        method: 'GET',
        path: '/api/users/:id',
        name: 'getUser',
        isMiddleware: false,
        responded: true,
      },
    ])
  })

  it('should mark a middleware that responded', async () => {
    const app = new Hono()
    app.use(async function guard(c, _next) {
      return c.text('blocked', 403)
    })
    app.get('/y', (c) => c.text('y'))

    const { app: traced, getTrace } = withTracer(app)
    const res = await traced.request('http://localhost/y')

    expect(res.status).toBe(403)
    expect(getTrace()).toEqual([
      { method: 'ALL', path: '/*', name: 'guard', isMiddleware: true, responded: true },
      { method: 'GET', path: '/y', name: '[handler]', isMiddleware: false },
    ])
  })

  it('should not mark anything on a not-found fallthrough', async () => {
    const app = new Hono()
    app.use(async function auth(_c, next) {
      await next()
    })
    app.get('/x', (c) => c.text('x'))

    const { app: traced, getTrace } = withTracer(app)
    const res = await traced.request('http://localhost/nope')

    expect(res.status).toBe(404)
    expect(getTrace()).toEqual([{ method: 'ALL', path: '/*', name: 'auth', isMiddleware: true }])
  })

  it('should return an empty trace before any request', () => {
    const { getTrace } = withTracer(new Hono())
    expect(getTrace()).toEqual([])
  })
})
