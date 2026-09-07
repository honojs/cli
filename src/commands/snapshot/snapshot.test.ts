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

  it('prints param and non-GET routes without an expect', async () => {
    const lines = (await snapshotLines(app())).map((l) => JSON.parse(l))
    expect(lines).toContainEqual({ path: '/users/:id' })
    expect(lines).toContainEqual({ method: 'POST', path: '/users' })
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

  it('every line is valid batch input', async () => {
    const { parseBatch } = await import('../batch/batch.js')
    const lines = await snapshotLines(app())
    expect(() => parseBatch(lines.join('\n'))).not.toThrow()
  })
})
