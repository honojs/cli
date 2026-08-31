import { describe, it, expect, vi, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { CliError } from '../../utils/output'
import { buildRunnerBody, parseRunnerOutput } from './runtime'

const MARKER = '__TEST_MARKER__'

const execNode = (code: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = execFile(process.execPath, ['--input-type=module'], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr))
        return
      }
      resolve(stdout)
    })
    child.stdin?.end(code)
  })

describe('buildRunnerBody', () => {
  const run = async (appExpr: string, request: Parameters<typeof buildRunnerBody>[0]) => {
    const code = `const app = ${appExpr}\n${buildRunnerBody(request, MARKER)}`
    const stdout = await execNode(code)
    return parseRunnerOutput(stdout, MARKER, 'node')
  }

  it('should send the request and print the response as a marker line', async () => {
    const result = await run(
      `{
        request: async (req) => {
          const url = new URL(req.url)
          return new Response(JSON.stringify({ path: url.pathname, body: await req.text() }), {
            status: 201,
            headers: { 'content-type': 'application/json', 'x-extra': 'yes' },
          })
        },
      }`,
      { path: '/echo', method: 'POST', headers: { 'x-in': 'abc' }, body: 'hello' }
    )

    expect(result.status).toBe(201)
    expect(result.headers['x-extra']).toBe('yes')
    const body = JSON.parse(Buffer.from(result.bodyBase64, 'base64').toString('utf-8'))
    expect(body).toEqual({ path: '/echo', body: 'hello' })
  })

  it('should fall back to fetch when the app has no request method', async () => {
    const result = await run(
      `{ fetch: (req) => new Response('from fetch', { headers: { 'x-h': req.headers.get('x-in') } }) }`,
      { path: '/', method: 'GET', headers: { 'x-in': 'v' } }
    )

    expect(result.status).toBe(200)
    expect(result.headers['x-h']).toBe('v')
    expect(Buffer.from(result.bodyBase64, 'base64').toString('utf-8')).toBe('from fetch')
  })

  it('should carry a binary body as base64', async () => {
    const result = await run(`{ fetch: () => new Response(new Uint8Array([0, 1, 254, 255])) }`, {
      path: '/',
      method: 'GET',
      headers: {},
    })

    expect([...Buffer.from(result.bodyBase64, 'base64')]).toEqual([0, 1, 254, 255])
  })
})

describe('parseRunnerOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should pick the marker line and forward other lines to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = parseRunnerOutput(
      `app log noise\n${MARKER}{"status":200,"headers":{},"bodyBase64":""}\n`,
      MARKER,
      'bun'
    )
    expect(result.status).toBe(200)
    expect(write).toHaveBeenCalledWith('app log noise\n')
  })

  it('should throw RUNTIME_FAILED when the marker line is missing', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => parseRunnerOutput('only logs\n', MARKER, 'bun')).toThrowError(CliError)
  })
})
