import { Command } from 'commander'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  resolve: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}))

vi.mock('../../utils/build.js', () => ({
  buildAndImportApp: vi.fn(),
}))

vi.mock('./engine.js', async (importOriginal) => {
  const original = await importOriginal<typeof EngineModule>()
  return { ...original, runBench: vi.fn() }
})

import type * as EngineModule from './engine.js'
import { benchmarkCommand } from './index.js'

describe('benchmarkCommand', () => {
  let program: Command
  const spyOnLog = () => vi.spyOn(console, 'log').mockImplementation(() => {})
  let consoleLogSpy: ReturnType<typeof spyOnLog>
  let consoleErrorSpy: ReturnType<typeof spyOnLog>

  const getMockModules = async () => ({
    existsSync: vi.mocked((await import('node:fs')).existsSync),
    realpathSync: vi.mocked((await import('node:fs')).realpathSync),
    readFileSync: vi.mocked((await import('node:fs')).readFileSync),
    resolve: vi.mocked((await import('node:path')).resolve),
  })
  const getMockBuildAndImportApp = async () =>
    vi.mocked((await import('../../utils/build.js')).buildAndImportApp)
  const getMockRunBench = async () => vi.mocked((await import('./engine.js')).runBench)

  let mockModules: Awaited<ReturnType<typeof getMockModules>>
  let mockBuildAndImportApp: Awaited<ReturnType<typeof getMockBuildAndImportApp>>
  let mockRunBench: Awaited<ReturnType<typeof getMockRunBench>>

  async function* createBuildIterator(app: Hono): AsyncGenerator<Hono> {
    yield app
  }

  const routeResult = {
    method: 'GET',
    path: '/',
    requests: 100,
    rps: 1000,
    latency: { avg: 0.1, p50: 0.1, p75: 0.1, p99: 0.2 },
  }

  const setupBasicMocks = (app: Hono) => {
    mockModules.existsSync.mockReturnValue(true)
    mockModules.realpathSync.mockReturnValue('test-app.js')
    mockModules.readFileSync.mockReturnValue('{"version":"4.99.0"}')
    mockModules.resolve.mockImplementation((cwd: string, path: string) => `${cwd}/${path}`)
    mockBuildAndImportApp.mockReturnValue(createBuildIterator(app))
    mockRunBench.mockResolvedValue([routeResult])
  }

  beforeEach(async () => {
    program = new Command()
    benchmarkCommand(program)
    consoleLogSpy = spyOnLog()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockModules = await getMockModules()
    mockBuildAndImportApp = await getMockBuildAndImportApp()
    mockRunBench = await getMockRunBench()

    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('should benchmark the GET routes of the app', async () => {
    const app = new Hono()
    app.use(async (_c, next) => {
      await next()
    })
    app.get('/', (c) => c.text('Hi'))
    app.get('/users/:id', (c) => c.json({}))
    app.post('/users', (c) => c.json({}))
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'benchmark', 'test-app.js'])

    const [, , , targets] = mockRunBench.mock.calls[0]
    expect(targets).toEqual([
      { method: 'GET', path: '/' },
      { method: 'GET', path: '/users/1' },
    ])
    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(true)
    expect(parsed.data.results).toEqual([{ hono: '4.99.0', routes: [routeResult] }])
  })

  it('should benchmark only the paths from -P', async () => {
    setupBasicMocks(new Hono())

    await program.parseAsync(['node', 'test', 'benchmark', '-P', '/a', '-P', '/b', 'test-app.js'])

    const [, , , targets] = mockRunBench.mock.calls[0]
    expect(targets).toEqual([
      { method: 'GET', path: '/a' },
      { method: 'GET', path: '/b' },
    ])
  })

  it('should fail with NO_ROUTES when the app has no GET routes', async () => {
    const app = new Hono()
    app.post('/users', (c) => c.json({}))
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'benchmark', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('NO_ROUTES')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })

  it('should reject an invalid duration', async () => {
    setupBasicMocks(new Hono())

    await program.parseAsync(['node', 'test', 'benchmark', '--duration', 'zero', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('INVALID_OPTION')
    process.exitCode = undefined
  })
})
