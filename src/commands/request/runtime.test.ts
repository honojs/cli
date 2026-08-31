import { describe, it, expect, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildRunnerScript } from './runtime'

const execNode = (script: string): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(process.execPath, [script], (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr))
        return
      }
      resolve()
    })
  })

describe('buildRunnerScript', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const run = async (appCode: string, request: Parameters<typeof buildRunnerScript>[2]) => {
    dir = mkdtempSync(join(tmpdir(), 'hono-cli-runner-test'))
    const bundlePath = join(dir, 'app.mjs')
    const runnerPath = join(dir, 'runner.mjs')
    const resultPath = join(dir, 'result.json')
    writeFileSync(bundlePath, appCode)
    writeFileSync(
      runnerPath,
      buildRunnerScript(pathToFileURL(bundlePath).href, resultPath, request)
    )
    await execNode(runnerPath)
    return JSON.parse(readFileSync(resultPath, 'utf-8'))
  }

  it('should send the request and write the response', async () => {
    const result = await run(
      `export default {
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
    expect(result.headers['content-type']).toBe('application/json')
    expect(result.headers['x-extra']).toBe('yes')
    const body = JSON.parse(Buffer.from(result.bodyBase64, 'base64').toString('utf-8'))
    expect(body).toEqual({ path: '/echo', body: 'hello' })
  })

  it('should fall back to fetch when the app has no request method', async () => {
    const result = await run(
      `export default {
        fetch: (req) => new Response('from fetch', { headers: { 'x-h': req.headers.get('x-in') } }),
      }`,
      { path: '/', method: 'GET', headers: { 'x-in': 'v' } }
    )

    expect(result.status).toBe(200)
    expect(result.headers['x-h']).toBe('v')
    expect(Buffer.from(result.bodyBase64, 'base64').toString('utf-8')).toBe('from fetch')
  })

  it('should carry a binary body as base64', async () => {
    const result = await run(
      `export default {
        fetch: () => new Response(new Uint8Array([0, 1, 254, 255]), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      }`,
      { path: '/', method: 'GET', headers: {} }
    )

    expect([...Buffer.from(result.bodyBase64, 'base64')]).toEqual([0, 1, 254, 255])
  })
})
