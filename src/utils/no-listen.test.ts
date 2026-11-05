import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runBench } from '../commands/benchmark/engine.js'
import { runInRuntime } from '../commands/request/runtime.js'

describe('noListen', () => {
  const cwd = process.cwd()

  afterEach(() => {
    process.chdir(cwd)
    vi.unstubAllEnvs()
  })

  const setupProject = () => {
    const dir = mkdtempSync(join(tmpdir(), 'hono-cli-no-listen-'))
    const pkg = join(dir, 'node_modules', '@hono', 'node-server')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(
      join(pkg, 'package.json'),
      '{"name":"@hono/node-server","type":"module","main":"index.js"}'
    )
    writeFileSync(
      join(pkg, 'index.js'),
      `export const serve = () => { throw new Error('listened') }
export const createAdaptorServer = () => ({})
export const other = 'kept'`
    )
    writeFileSync(
      join(dir, 'app.ts'),
      `import { serve, other } from '@hono/node-server'
const fetch = () => new Response(other)
serve({ fetch })
export default { fetch, request: fetch }`
    )
    process.chdir(dir)
    return dir
  }

  it('should not listen in the benchmark', { timeout: 30000 }, async () => {
    const dir = setupProject()
    const routes = await runBench(
      join(dir, 'app.ts'),
      [],
      { label: 'test' },
      [{ method: 'GET', path: '/' }],
      { duration: 50, warmup: 1 }
    )
    expect(routes[0].requests).toBeGreaterThan(0)
  })

  it('should not listen in another runtime', { timeout: 30000 }, async () => {
    const dir = setupProject()
    // A stand-in for Bun, to run this without it
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'bun'), `#!/bin/sh\nexec "${process.execPath}" --input-type=module\n`)
    chmodSync(join(bin, 'bun'), 0o755)
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH}`)

    const response = await runInRuntime('bun', join(dir, 'app.ts'), [], {
      path: '/',
      method: 'GET',
      headers: {},
    })
    expect(response.status).toBe(200)
    expect(Buffer.from(response.bodyBase64, 'base64').toString()).toBe('kept')
  })
})
