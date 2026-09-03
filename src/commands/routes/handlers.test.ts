import { Hono } from 'hono'
import { describe, it, expect } from 'vitest'
import { inspectHandlers } from './handlers.js'

describe('inspectHandlers', () => {
  it('reports default handlers', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('hi'))
    expect(await inspectHandlers(app)).toEqual({ notFound: 'default', onError: 'default' })
  })

  it('reports a custom notFound handler', async () => {
    const app = new Hono()
    app.notFound((c) => c.json({ error: 'not found' }, 404))
    expect(await inspectHandlers(app)).toEqual({ notFound: 'custom', onError: 'default' })
  })

  it('reports a custom onError handler', async () => {
    const app = new Hono()
    app.onError((_, c) => c.json({ error: 'boom' }, 500))
    expect(await inspectHandlers(app)).toEqual({ notFound: 'default', onError: 'custom' })
  })

  it('reports unknown when a wildcard route answers the probe', async () => {
    const app = new Hono()
    app.get('*', (c) => c.text('catch all'))
    const result = await inspectHandlers(app)
    expect(result.notFound).toBe('unknown')
  })

  it('sees through basePath and mounted sub-apps', async () => {
    const app = new Hono().basePath('/api')
    app.notFound((c) => c.json({ error: 'nope' }, 404))
    const result = await inspectHandlers(app)
    expect(result.notFound).toBe('custom')
  })
})
