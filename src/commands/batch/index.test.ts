import { Command } from 'commander'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  resolve: vi.fn(),
}))

vi.mock('../../utils/build.js', () => ({
  buildAndImportApp: vi.fn(),
}))

vi.mock('../../utils/bindings.js', () => ({
  maybeLoadBindings: vi.fn(async () => undefined),
}))

vi.mock('../../utils/workerd.js', () => ({
  startWorkerd: vi.fn(),
}))

import { batchCommand } from './index.js'

describe('batchCommand', () => {
  let program: Command
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  async function* iteratorOf(app: Hono): AsyncGenerator<Hono> {
    yield app
  }

  beforeEach(async () => {
    program = new Command()
    batchCommand(program)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fs = await import('node:fs')
    const path = await import('node:path')
    const build = await import('../../utils/build.js')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.realpathSync).mockReturnValue('test-app.js')
    vi.mocked(path.resolve).mockImplementation((cwd: string, p: string) => `${cwd}/${p}`)
    const app = new Hono()
    app.get('/data', (c) => c.json({ ok: 1 }))
    vi.mocked(build.buildAndImportApp).mockReturnValue(iteratorOf(app))
    vi.mocked(fs.readFileSync).mockReturnValue('{"path":"/data","expect":{"status":200}}')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('should run the steps from a JSONL file and print the envelope', async () => {
    await program.parseAsync(['node', 'test', 'batch', 'steps.jsonl', 'test-app.js'])
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0] as string)).toEqual({
      ok: true,
      data: {
        steps: [
          {
            method: 'GET',
            path: '/data',
            status: 200,
            body: { ok: 1 },
            pass: true,
            expect: { status: 200 },
          },
        ],
        summary: { total: 1, passed: 1, failed: 0 },
      },
    })
  })

  it('should print only the failed steps and the summary with --compact', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockReturnValue(
      '{"path":"/data","expect":{"status":200}}\n{"path":"/data","expect":{"status":404}}'
    )
    await program.parseAsync(['node', 'test', 'batch', 'steps.jsonl', 'test-app.js', '--compact'])
    const raw = consoleLogSpy.mock.calls[0][0] as string
    expect(raw).not.toContain('\n  ')
    expect(JSON.parse(raw)).toEqual({
      ok: true,
      data: {
        steps: [
          {
            method: 'GET',
            path: '/data',
            status: 200,
            body: { ok: 1 },
            pass: false,
            expect: { status: 404 },
            diff: ['status: expected 404, got 200'],
          },
        ],
        summary: { total: 2, passed: 1, failed: 1 },
      },
    })
  })

  it('should run every step in one workerd with --runtime workerd', async () => {
    const workerd = await import('../../utils/workerd.js')
    const target = {
      request: vi.fn(async (input: Request) =>
        Response.json({ path: new URL(input.url).pathname })
      ),
      fetch: vi.fn(),
      dispose: vi.fn(async () => {}),
    }
    vi.mocked(workerd.startWorkerd).mockResolvedValue(target)
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockReturnValue('{"path":"/a"}\n{"path":"/b"}')
    await program.parseAsync(['node', 'test', 'batch', 'steps.jsonl', '--runtime', 'workerd'])
    expect(workerd.startWorkerd).toHaveBeenCalledTimes(1)
    expect(target.request).toHaveBeenCalledTimes(2)
    expect(target.dispose).toHaveBeenCalledTimes(1)
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(output.data.steps.map((s: { body: { path: string } }) => s.body.path)).toEqual([
      '/a',
      '/b',
    ])
    expect(output.data.summary).toEqual({ total: 2, passed: 2, failed: 0 })
  })

  it('should reject a file argument with --runtime workerd', async () => {
    await program.parseAsync([
      'node',
      'test',
      'batch',
      'steps.jsonl',
      'test-app.js',
      '--runtime',
      'workerd',
    ])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_OPTION')
  })

  it('should reject --runtime bun', async () => {
    await program.parseAsync(['node', 'test', 'batch', 'steps.jsonl', '--runtime', 'bun'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(output.error.code).toBe('INVALID_OPTION')
    expect(output.error.message).toBe('Unknown runtime: bun')
  })

  it('should reject the app and the batch both from stdin', async () => {
    await program.parseAsync(['node', 'test', 'batch', '-', '-'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_OPTION')
  })
})
