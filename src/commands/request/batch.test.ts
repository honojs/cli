import { Hono } from 'hono'
import { describe, it, expect } from 'vitest'
import { CliError } from '../../utils/output.js'
import { getByPath, interpolate, parseBatch, runBatch } from './batch.js'

describe('parseBatch', () => {
  it('parses one step per line and skips empty lines', () => {
    const steps = parseBatch('{"path":"/a"}\n\n{"method":"post","path":"/b"}\n')
    expect(steps).toEqual([
      { method: 'GET', path: '/a', body: undefined, headers: undefined, save: undefined },
      { method: 'POST', path: '/b', body: undefined, headers: undefined, save: undefined },
    ])
  })

  it.each([
    ['not json', 'not json'],
    ['no path', '{"method":"GET"}'],
    ['path without slash', '{"path":"users"}'],
    ['non-string save', '{"path":"/a","save":{"id":1}}'],
    ['empty input', '\n\n'],
  ])('throws BATCH_INVALID on %s', (_, input) => {
    try {
      parseBatch(input)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(CliError)
      if (e instanceof CliError) {
        expect(e.code).toBe('BATCH_INVALID')
      }
    }
  })
})

describe('interpolate', () => {
  it('replaces variables in strings, arrays, and objects', () => {
    expect(interpolate({ a: '/users/{{id}}', b: ['{{id}}'], c: 1 }, { id: 7 })).toEqual({
      a: '/users/7',
      b: ['7'],
      c: 1,
    })
  })

  it('throws BATCH_INVALID on an unknown variable', () => {
    try {
      interpolate('/users/{{nope}}', {})
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(CliError)
      if (e instanceof CliError) {
        expect(e.code).toBe('BATCH_INVALID')
      }
    }
  })
})

describe('getByPath', () => {
  it('walks dot paths including array indexes', () => {
    expect(getByPath({ items: [{ id: 3 }] }, '.items.0.id')).toBe(3)
    expect(getByPath({ id: 1 }, '.id')).toBe(1)
    expect(getByPath({ id: 1 }, '.missing')).toBeUndefined()
    expect(getByPath('text', '.id')).toBeUndefined()
  })
})

describe('runBatch', () => {
  const crudApp = () => {
    const app = new Hono()
    const users = new Map<number, { id: number; name: string }>()
    let nextId = 1
    app.get('/users', (c) => c.json([...users.values()]))
    app.post('/users', async (c) => {
      const { name } = await c.req.json<{ name: string }>()
      const user = { id: nextId++, name }
      users.set(user.id, user)
      return c.json(user, 201)
    })
    app.get('/users/:id', (c) => {
      const user = users.get(Number(c.req.param('id')))
      return user ? c.json(user) : c.json({ error: 'not found' }, 404)
    })
    return app
  }

  it('carries saved values between steps against one app instance', async () => {
    const result = await runBatch(
      crudApp(),
      parseBatch(
        [
          '{"method":"POST","path":"/users","body":{"name":"Momo"},"save":{"id":".id"}}',
          '{"path":"/users/{{id}}"}',
        ].join('\n')
      )
    )
    expect(result.steps[0].status).toBe(201)
    expect(result.steps[0].saved).toEqual({ id: 1 })
    expect(result.steps[1].path).toBe('/users/1')
    expect(result.steps[1].status).toBe(200)
    expect(result.steps[1].body).toEqual({ id: 1, name: 'Momo' })
  })

  it('reports the status and body as facts, without judging', async () => {
    const result = await runBatch(crudApp(), parseBatch('{"path":"/nope"}'))
    expect(result.steps[0]).toEqual({
      method: 'GET',
      path: '/nope',
      status: 404,
      body: '404 Not Found',
    })
  })

  it('reports a save path missing from the body as an error fact', async () => {
    const result = await runBatch(crudApp(), parseBatch('{"path":"/users","save":{"id":".id"}}'))
    expect(result.steps[0].error).toBe('save: .id not found in the body')
    expect(result.steps[0].saved).toBeUndefined()
  })

  it('sends shared headers, and step headers win', async () => {
    const app = new Hono()
    app.get('/echo', (c) => c.json({ auth: c.req.header('authorization'), x: c.req.header('x-a') }))
    const result = await runBatch(
      app,
      parseBatch('{"path":"/echo"}\n{"path":"/echo","headers":{"authorization":"step"}}'),
      { authorization: 'shared', 'x-a': '1' }
    )
    expect(result.steps[0].body).toEqual({ auth: 'shared', x: '1' })
    expect(result.steps[1].body).toEqual({ auth: 'step', x: '1' })
  })

  it('sends an object body as JSON with the content-type set', async () => {
    const app = new Hono()
    app.post('/echo', async (c) =>
      c.json({ type: c.req.header('content-type'), body: await c.req.json() })
    )
    const result = await runBatch(
      app,
      parseBatch('{"method":"POST","path":"/echo","body":{"name":"Momo"}}')
    )
    expect(result.steps[0].body).toEqual({
      type: 'application/json',
      body: { name: 'Momo' },
    })
  })
})
