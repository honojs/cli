import { Hono } from 'hono'
import { describe, it, expect, vi } from 'vitest'
import { snapshotLines } from './snapshot.js'

// Hono v5 lists notFound and onError handlers like this
vi.mock('hono/dev', () => ({
  inspectRoutes: () => [
    { path: '/health', method: 'GET', name: '[handler]', isMiddleware: false },
    { path: '/*', method: '@NOT_FOUND', name: '[handler]', isMiddleware: false },
    { path: '/*', method: '@ERROR', name: '[handler]', isMiddleware: false },
  ],
}))

describe('snapshotLines on Hono v5', () => {
  it('skips the notFound and onError handlers', async () => {
    const app = new Hono()
    app.get('/health', (c) => c.text('ok'))
    const lines = (await snapshotLines(app)).map((l) => JSON.parse(l))
    expect(lines).toEqual([
      { path: '/health', expect: { status: 200, body: 'ok' } },
      { path: '/__no_such_path__', expect: { status: 404, body: '404 Not Found' } },
    ])
  })
})
