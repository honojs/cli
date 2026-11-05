import type * as Fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CliError } from './output'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { findWranglerConfig, runOnWorkerd, startWorkerd, workerdTarget } from './workerd'
import type { StartedWorker } from './workerd'

const getMockExistsSync = async () => vi.mocked((await import('node:fs')).existsSync)

describe('findWranglerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should pick the first existing candidate', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockImplementation((path) => String(path).endsWith('wrangler.jsonc'))
    expect(findWranglerConfig()).toBe('wrangler.jsonc')
  })

  it('should return undefined without a config', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(false)
    expect(findWranglerConfig()).toBeUndefined()
  })
})

describe('runOnWorkerd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fail with WRANGLER_CONFIG_NOT_FOUND without a config', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(false)
    const promise = runOnWorkerd({ path: '/', method: 'GET', headers: {} })
    await expect(promise).rejects.toThrowError(CliError)
    await expect(promise).rejects.toMatchObject({ code: 'WRANGLER_CONFIG_NOT_FOUND' })
  })

  it('should fail with CLOUDFLARE_CONFIG_NOT_SUPPORTED with only cloudflare.config.ts', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockImplementation((path) => String(path).endsWith('cloudflare.config.ts'))
    const promise = runOnWorkerd({ path: '/', method: 'GET', headers: {} })
    await expect(promise).rejects.toMatchObject({
      code: 'CLOUDFLARE_CONFIG_NOT_SUPPORTED',
      suggestions: ['Add wrangler.jsonc with a main entry'],
    })
  })

  it('should point at --runtime vite with cloudflare.config.ts and a Vite config', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockImplementation((path) => /(cloudflare|vite)\.config\.ts$/.test(String(path)))
    const promise = runOnWorkerd({ path: '/', method: 'GET', headers: {} })
    await expect(promise).rejects.toMatchObject({
      code: 'CLOUDFLARE_CONFIG_NOT_SUPPORTED',
      suggestions: [expect.stringContaining('--runtime vite')],
    })
    await expect(promise).rejects.not.toHaveProperty('docs', expect.stringContaining('wrangler'))
  })

  it('should fail with WRANGLER_NOT_FOUND when wrangler is not installed', async () => {
    // This repo has a config (mocked) but no wrangler dependency
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(true)
    const promise = runOnWorkerd({ path: '/', method: 'GET', headers: {} })
    await expect(promise).rejects.toMatchObject({ code: 'WRANGLER_NOT_FOUND' })
  })
})

describe('startWorkerd', () => {
  const cwd = process.cwd()

  afterEach(() => {
    process.chdir(cwd)
  })

  it('should keep the cause when workerd fails to start', async () => {
    const fs = await vi.importActual<typeof Fs>('node:fs')
    const dir = fs.mkdtempSync(join(tmpdir(), 'hono-cli-workerd-'))
    const wrangler = join(dir, 'node_modules', 'wrangler')
    fs.mkdirSync(wrangler, { recursive: true })
    fs.writeFileSync(join(dir, 'package.json'), '{"name":"probe"}')
    fs.writeFileSync(join(wrangler, 'package.json'), '{"name":"wrangler","main":"index.js"}')
    fs.writeFileSync(
      join(wrangler, 'index.js'),
      `exports.unstable_startWorker = async () => {
        throw new Error('An error occurred when starting the server', {
          cause: new Error('Use a local Postgres connection string'),
        })
      }`
    )
    process.chdir(dir)
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(true)

    await expect(startWorkerd()).rejects.toMatchObject({
      code: 'RUNTIME_FAILED',
      message: 'workerd failed to start: Use a local Postgres connection string',
      suggestions: ['Check the wrangler config'],
    })
  })
})

describe('workerdTarget', () => {
  const fakeWorker = (fetch: StartedWorker['fetch']) => {
    const worker = { fetch: vi.fn(fetch), dispose: vi.fn(async () => {}) }
    return worker
  }

  it('forwards a Request as path, method, headers and body, and keeps the worker up', async () => {
    const worker = fakeWorker(async (url, init) => {
      const body = init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : ''
      return new Response(`${init?.method} ${url} ${body}`, { status: 201 })
    })
    const target = workerdTarget(worker)

    const first = await target.request(
      new Request('http://localhost/users?x=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":"Momo"}',
      })
    )
    expect(first.status).toBe(201)
    expect(await first.text()).toBe('POST http://localhost/users?x=1 {"name":"Momo"}')
    expect(worker.fetch.mock.calls[0][1]?.headers).toEqual({ 'content-type': 'application/json' })

    const second = await target.request(new Request('http://localhost/users'))
    expect(await second.text()).toBe('GET http://localhost/users ')
    expect(worker.fetch).toHaveBeenCalledTimes(2)
    expect(worker.dispose).not.toHaveBeenCalled()

    await target.dispose()
    await target.dispose()
    expect(worker.dispose).toHaveBeenCalledTimes(1)
  })

  it('returns the status, headers and text from fetch', async () => {
    const worker = fakeWorker(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    const result = await workerdTarget(worker).fetch({ path: 'api', method: 'GET', headers: {} })
    expect(result).toMatchObject({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    })
    expect(worker.fetch.mock.calls[0][0]).toBe('http://localhost/api')
  })

  it('reports the dispose cause when the first fetch hangs', async () => {
    const worker = {
      fetch: vi.fn(() => new Promise<Response>(() => {})),
      dispose: vi.fn(async () => {
        throw new Error('bad config')
      }),
    }
    const promise = workerdTarget(worker, 20).request(new Request('http://localhost/'))
    await expect(promise).rejects.toMatchObject({
      code: 'RUNTIME_FAILED',
      message: 'The app failed on workerd: bad config',
    })
    expect(worker.dispose).toHaveBeenCalledTimes(1)
  })
})
