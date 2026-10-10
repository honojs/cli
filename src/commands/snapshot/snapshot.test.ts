import { Hono } from 'hono'
import { describe, it, expect } from 'vitest'
import { snapshotLines } from './snapshot.js'

describe('snapshotLines', () => {
  const app = () => {
    const a = new Hono()
    a.get('/users', (c) => c.json([{ id: 1, name: 'Momo' }]))
    a.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))
    a.post('/users', (c) => c.json({ ok: true }, 201))
    a.get('/health', (c) => c.text('ok'))
    return a
  }

  it('captures paramless GET routes with their actual response as expect', async () => {
    const lines = (await snapshotLines(app())).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({
      path: '/users',
      expect: { status: 200, body: [{ id: 1, name: 'Momo' }] },
    })
    expect(lines).toContainEqual({ path: '/health', expect: { status: 200, body: 'ok' } })
  })

  it('prints non-GET routes without an expect', async () => {
    const lines = (await snapshotLines(app())).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({ method: 'POST', path: '/users' })
  })

  it('fills a param from a JSON field with the same name', async () => {
    const lines = (await snapshotLines(app())).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({ path: '/users/1', expect: { status: 200, body: { id: '1' } } })
  })

  it('follows links to param routes, page by page', async () => {
    const a = new Hono()
    a.get('/', (c) => c.html('<a href="/tags">Tags</a> <a href="/about">About</a>'))
    a.get('/tags', (c) => c.html('<a href="/tags/news">#news</a>'))
    a.get('/tags/:tag', (c) => c.html(`<a href="/posts/hello?ref=${c.req.param('tag')}">Hello</a>`))
    a.get('/posts/:slug', (c) => c.text(`post ${c.req.param('slug')}`))
    a.get('/api/posts/:slug', (c) => c.json({ slug: c.req.param('slug') }))
    a.get('/page/:n{[0-9]+}', (c) => c.text('page'))
    a.get('/:page', (c) => c.text(`page ${c.req.param('page')}`))
    const lines = (await snapshotLines(a)).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({ path: '/tags/news', expect: expect.anything() })
    expect(lines).toContainEqual({
      path: '/posts/hello',
      expect: { status: 200, body: 'post hello' },
    })
    // The value from the link fills the same param name elsewhere
    expect(lines).toContainEqual({ path: '/api/posts/hello', expect: expect.anything() })
    // A path that a paramless route already answered is not used again
    expect(lines).toContainEqual({ path: '/about', expect: { status: 200, body: 'page about' } })
    // No value matches [0-9]+, so the route stays for the caller to fill in
    expect(lines).toContainEqual({ path: '/page/:n{[0-9]+}' })
  })

  it('records the current not-found behavior as a probe line', async () => {
    const lines = (await snapshotLines(app())).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({
      path: '/__no_such_path__',
      expect: { status: 404, body: '404 Not Found' },
    })
  })

  it('captures only the status with statusOnly, except the probe line', async () => {
    const lines = (await snapshotLines(app(), true)).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({ path: '/users', expect: { status: 200 } })
    expect(lines).toContainEqual({ path: '/health', expect: { status: 200 } })
    expect(lines).toContainEqual({
      path: '/__no_such_path__',
      expect: { status: 404, body: '404 Not Found' },
    })
  })

  it('passes the env through to c.env', async () => {
    const a = new Hono()
    a.get('/env', (c) => c.json({ v: (c.env as { MY_VAR: string }).MY_VAR }))
    const lines = (await snapshotLines(a, false, { MY_VAR: 'hello' })).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({ path: '/env', expect: { status: 200, body: { v: 'hello' } } })
  })

  it('every line is valid batch input', async () => {
    const { parseBatch } = await import('../batch/batch.js')
    const lines = await snapshotLines(app())
    expect(() => parseBatch(lines.join('\n'))).not.toThrow()
  })
})

describe('snapshotLines with a target', () => {
  it('reads the routes from the app and sends the requests to the target', async () => {
    const a = new Hono()
    a.get('/users', (c) => c.json([{ id: 1 }]))
    a.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))
    const seen: string[] = []
    const target = {
      request: async (input: Request) => {
        seen.push(new URL(input.url).pathname)
        return Response.json({ from: 'workerd' })
      },
    }
    const lines = (await snapshotLines(a, false, undefined, target)).map((l) => JSON.parse(l))
    expect(seen).toEqual(['/users', '/__no_such_path__'])
    expect(lines).toEqual([
      { path: '/users', expect: { status: 200, body: { from: 'workerd' } } },
      { path: '/users/:id' },
      { path: '/__no_such_path__', expect: { status: 200, body: { from: 'workerd' } } },
    ])
  })
})
