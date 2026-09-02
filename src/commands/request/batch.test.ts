import { Hono } from 'hono'
import { describe, it, expect } from 'vitest'
import { CliError } from '../../utils/output.js'
import { getByPath, interpolate, parseBatch, runBatch } from './batch.js'

describe('parseBatch', () => {
  it('parses one step per line and skips empty lines', () => {
    const steps = parseBatch('{"path":"/a"}\n\n{"method":"post","path":"/b","expect":201}\n')
    expect(steps).toEqual([
      {
        method: 'GET',
        path: '/a',
        body: undefined,
        headers: undefined,
        expect: undefined,
        save: undefined,
      },
      {
        method: 'POST',
        path: '/b',
        body: undefined,
        headers: undefined,
        expect: 201,
        save: undefined,
      },
    ])
  })

  it.each([
    ['not json', 'not json'],
    ['no path', '{"method":"GET"}'],
    ['path without slash', '{"path":"users"}'],
    ['non-number expect', '{"path":"/a","expect":"200"}'],
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
    expect(interpolate({ a: '/users/${id}', b: ['${id}'], c: 1 }, { id: 7 })).toEqual({
      a: '/users/7',
      b: ['7'],
      c: 1,
    })
  })

  it('throws BATCH_INVALID on an unknown variable', () => {
    try {
      interpolate('/users/${nope}', {})
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
          '{"method":"POST","path":"/users","body":{"name":"Momo"},"expect":201,"save":{"id":".id"}}',
          '{"path":"/users/${id}","expect":200}',
        ].join('\n')
      )
    )
    expect(result.summary).toEqual({ total: 2, passed: 2, failed: 0 })
    expect(result.steps[0].saved).toEqual({ id: 1 })
    expect(result.steps[1].path).toBe('/users/1')
    expect(result.steps[1].body).toEqual({ id: 1, name: 'Momo' })
  })

  it('fails a step on an expect mismatch and suggests --trace on 404', async () => {
    const result = await runBatch(crudApp(), parseBatch('{"path":"/nope","expect":200}'))
    expect(result.summary.failed).toBe(1)
    expect(result.steps[0].pass).toBe(false)
    expect(result.steps[0].suggestions).toEqual([
      'See which routes matched: hono request -P /nope --trace',
    ])
  })

  it('fails a step when a save path is not in the body', async () => {
    const result = await runBatch(
      crudApp(),
      parseBatch('{"path":"/users","expect":200,"save":{"id":".id"}}')
    )
    expect(result.steps[0].pass).toBe(false)
    expect(result.steps[0].error).toBe('save: .id not found in the body')
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
