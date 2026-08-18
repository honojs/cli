import { Command } from 'commander'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  resolve: vi.fn(),
}))

vi.mock('../../utils/build.js', () => ({
  buildAndImportApp: vi.fn(),
}))

import { routesCommand } from './index.js'

describe('routesCommand', () => {
  let program: Command
  const spyOnConsole = (method: 'log' | 'warn' | 'error') =>
    vi.spyOn(console, method).mockImplementation(() => {})
  let consoleLogSpy: ReturnType<typeof spyOnConsole>

  const getMockModules = async () => ({
    existsSync: vi.mocked((await import('node:fs')).existsSync),
    realpathSync: vi.mocked((await import('node:fs')).realpathSync),
    resolve: vi.mocked((await import('node:path')).resolve),
  })
  const getMockBuildAndImportApp = async () =>
    vi.mocked((await import('../../utils/build.js')).buildAndImportApp)

  let mockModules: Awaited<ReturnType<typeof getMockModules>>
  let mockBuildAndImportApp: Awaited<ReturnType<typeof getMockBuildAndImportApp>>

  async function* createBuildIterator(app: Hono): AsyncGenerator<Hono> {
    yield app
  }

  const setupBasicMocks = (mockApp: Hono) => {
    mockModules.existsSync.mockReturnValue(true)
    mockModules.realpathSync.mockReturnValue('test-app.js')
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })
    mockBuildAndImportApp.mockReturnValue(createBuildIterator(mockApp))
  }

  beforeEach(async () => {
    program = new Command()
    routesCommand(program)
    consoleLogSpy = spyOnConsole('log')

    mockModules = await getMockModules()
    mockBuildAndImportApp = await getMockBuildAndImportApp()

    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('should list routes as the JSON envelope', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('Hello'))
    app.post('/posts', (c) => c.json({ ok: true }))
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'routes', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(true)
    expect(typeof parsed.data.router).toBe('string')
    expect(parsed.data.routes).toEqual([
      { method: 'GET', path: '/', name: '[handler]', isMiddleware: false },
      { method: 'POST', path: '/posts', name: '[handler]', isMiddleware: false },
    ])
  })

  it('should exclude middleware by default', async () => {
    const app = new Hono()
    app.use(async (_c, next) => {
      await next()
    })
    app.get('/', (c) => c.text('Hello'))
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'routes', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.data.routes).toEqual([
      { method: 'GET', path: '/', name: '[handler]', isMiddleware: false },
    ])
  })

  it('should include middleware with --verbose', async () => {
    const app = new Hono()
    app.use(async (_c, next) => {
      await next()
    })
    app.get('/', (c) => c.text('Hello'))
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'routes', '--verbose', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.data.routes).toEqual([
      { method: 'ALL', path: '/*', name: '[middleware]', isMiddleware: true },
      { method: 'GET', path: '/', name: '[handler]', isMiddleware: false },
    ])
  })

  it('should print routes as text with --plain', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('Hello'))
    app.delete('/posts/:id', (c) => c.json({ ok: true }))
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'routes', '--plain', 'test-app.js'])

    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, 'GET    /')
    expect(consoleLogSpy).toHaveBeenNthCalledWith(2, 'DELETE /posts/:id')
  })

  it('should print a JSON error when the entry file is not found', async () => {
    mockModules.existsSync.mockReturnValue(false)
    mockModules.resolve.mockImplementation((cwd: string, path: string) => `${cwd}/${path}`)

    await program.parseAsync(['node', 'test', 'routes', 'missing.ts'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('ENTRY_NOT_FOUND')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })

  it('should print a JSON error when the app does not expose routes', async () => {
    const app = new Hono()
    Reflect.set(app, 'routes', undefined)
    setupBasicMocks(app)

    await program.parseAsync(['node', 'test', 'routes', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('INVALID_APP')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })
})
