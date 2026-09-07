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
          },
        ],
        summary: { total: 2, passed: 1, failed: 1 },
      },
    })
  })

  it('should reject the app and the batch both from stdin', async () => {
    await program.parseAsync(['node', 'test', 'batch', '-', '-'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_OPTION')
  })
})
