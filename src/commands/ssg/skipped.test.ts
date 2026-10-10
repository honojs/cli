import { Hono } from 'hono'
import type { FileSystemModule } from 'hono/ssg'
import { ssgParams, toSSG } from 'hono/ssg'
import { describe, expect, it, vi } from 'vitest'
import { trackSkipped } from './skipped.js'

describe('trackSkipped', () => {
  it('should record the pages that toSSG skips', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = new Hono()
    app.get('/', (c) => c.html('<p>home</p>'))
    app.get('/counter', () => {
      throw new Error('no KV')
    })
    app.get(
      '/posts/:id',
      ssgParams(() => [{ id: '1' }, { id: '2' }]),
      (c) => (c.req.param('id') === '1' ? c.html('<p>1</p>') : c.notFound())
    )

    const fs: FileSystemModule = {
      writeFile: async () => undefined,
      mkdir: async () => undefined,
    }
    const tracked = trackSkipped(app)
    const result = await toSSG(tracked.app, fs, {
      dir: 'static',
      afterResponseHook: tracked.afterResponseHook,
    })

    expect(result.files).toEqual(['static/index.html', 'static/posts/1.html'])
    // toSSG runs pages concurrently, so the order is not fixed
    expect(tracked.skipped).toHaveLength(2)
    expect(tracked.skipped).toEqual(
      expect.arrayContaining([
        { path: '/counter', status: 500 },
        { path: '/posts/2', status: 404 },
      ])
    )
  })
})
