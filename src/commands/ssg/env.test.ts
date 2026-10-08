import { Hono } from 'hono'
import type { FileSystemModule } from 'hono/ssg'
import { ssgParams, toSSG } from 'hono/ssg'
import { describe, expect, it } from 'vitest'
import { withBindings } from './env.js'

describe('withBindings', () => {
  it('should give c.env the bindings while toSSG generates the pages', async () => {
    const app = new Hono<{ Bindings: { COUNTER: string } }>()
    app.get('/', (c) => c.html(`<p>${c.env.COUNTER}</p>`))
    app.get(
      '/posts/:id',
      ssgParams(() => [{ id: '1' }]),
      (c) => c.html(`<p>${c.req.param('id')} ${c.env.COUNTER}</p>`)
    )

    const files = new Map<string, string>()
    const fs: FileSystemModule = {
      writeFile: async (path, data) => {
        files.set(path, data.toString())
      },
      mkdir: async () => undefined,
    }
    const result = await toSSG(withBindings(app as unknown as Hono, { COUNTER: '2' }), fs, {
      dir: 'static',
    })

    expect(result.success).toBe(true)
    expect(files.get('static/index.html')).toBe('<p>2</p>')
    // The SSG context still reaches the app: ssgParams works
    expect(files.get('static/posts/1.html')).toBe('<p>1 2</p>')
  })
})
