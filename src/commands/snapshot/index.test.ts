import { Command } from 'commander'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  realpathSync: vi.fn((p: string) => p),
  readFileSync: vi.fn(),
}))

vi.mock('../../utils/build.js', () => ({
  buildAndImportApp: vi.fn(),
}))

vi.mock('../../utils/bindings.js', () => ({
  maybeLoadBindings: vi.fn(async () => undefined),
}))

vi.mock('../../utils/workerd.js', () => ({
  startWorkerd: vi.fn(),
  readWorkerdMain: vi.fn(),
}))

import { snapshotCommand } from './index.js'

describe('snapshotCommand', () => {
  let program: Command
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  async function* iteratorOf(app: Hono): AsyncGenerator<Hono> {
    yield app
  }

  beforeEach(async () => {
    program = new Command()
    snapshotCommand(program)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const build = await import('../../utils/build.js')
    const app = new Hono()
    app.get('/data', (c) => c.json({ from: 'node' }))
    vi.mocked(build.buildAndImportApp).mockReturnValue(iteratorOf(app))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('should read the routes from main and send the requests to workerd', async () => {
    const workerd = await import('../../utils/workerd.js')
    const build = await import('../../utils/build.js')
    const target = {
      request: vi.fn(async () => Response.json({ from: 'workerd' })),
      fetch: vi.fn(),
      dispose: vi.fn(async () => {}),
    }
    vi.mocked(workerd.readWorkerdMain).mockResolvedValue('/proj/src/index.ts')
    vi.mocked(workerd.startWorkerd).mockResolvedValue(target)

    await program.parseAsync(['node', 'test', 'snapshot', '--runtime', 'workerd'])

    expect(vi.mocked(build.buildAndImportApp).mock.calls[0][0]).toBe('/proj/src/index.ts')
    expect(target.request).toHaveBeenCalledTimes(2)
    expect(target.dispose).toHaveBeenCalledTimes(1)
    const lines = (consoleLogSpy.mock.calls[0][0] as string).split('\n').map((l) => JSON.parse(l))
    expect(lines[0]).toEqual({ path: '/data', expect: { status: 200, body: { from: 'workerd' } } })
  })

  it('should reject a file argument with --runtime workerd', async () => {
    await program.parseAsync(['node', 'test', 'snapshot', 'src/app.ts', '--runtime', 'workerd'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_OPTION')
  })
})
