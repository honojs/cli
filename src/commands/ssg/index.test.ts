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

vi.mock('hono/ssg', () => ({
  toSSG: vi.fn(),
}))

import { ssgCommand } from './index.js'

describe('ssgCommand', () => {
  let program: Command
  const spyOnLog = () => vi.spyOn(console, 'log').mockImplementation(() => {})
  let consoleLogSpy: ReturnType<typeof spyOnLog>

  const getMockModules = async () => ({
    existsSync: vi.mocked((await import('node:fs')).existsSync),
    realpathSync: vi.mocked((await import('node:fs')).realpathSync),
    resolve: vi.mocked((await import('node:path')).resolve),
  })
  const getMockBuildAndImportApp = async () =>
    vi.mocked((await import('../../utils/build.js')).buildAndImportApp)
  const getMockToSSG = async () => vi.mocked((await import('hono/ssg')).toSSG)

  let mockModules: Awaited<ReturnType<typeof getMockModules>>
  let mockBuildAndImportApp: Awaited<ReturnType<typeof getMockBuildAndImportApp>>
  let mockToSSG: Awaited<ReturnType<typeof getMockToSSG>>

  async function* createBuildIterator(app: Hono): AsyncGenerator<Hono> {
    yield app
  }

  const app = new Hono()

  const setupBasicMocks = () => {
    mockModules.existsSync.mockReturnValue(true)
    mockModules.realpathSync.mockReturnValue('test-app.js')
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })
    mockBuildAndImportApp.mockReturnValue(createBuildIterator(app))
  }

  beforeEach(async () => {
    program = new Command()
    ssgCommand(program)
    consoleLogSpy = spyOnLog()

    mockModules = await getMockModules()
    mockBuildAndImportApp = await getMockBuildAndImportApp()
    mockToSSG = await getMockToSSG()

    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('should generate static files and print the JSON envelope', async () => {
    setupBasicMocks()
    mockToSSG.mockResolvedValue({
      success: true,
      files: ['static/index.html', 'static/about.html'],
    })

    await program.parseAsync(['node', 'test', 'ssg', 'test-app.js'])

    const fsPromises = (await import('node:fs/promises')).default
    expect(mockToSSG).toHaveBeenCalledWith(app, fsPromises, { dir: 'static' })
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        output: 'static',
        files: ['static/index.html', 'static/about.html'],
      },
    })
  })

  it('should pass the output directory from -o', async () => {
    setupBasicMocks()
    mockToSSG.mockResolvedValue({ success: true, files: [] })

    await program.parseAsync(['node', 'test', 'ssg', '-o', 'dist/static', 'test-app.js'])

    const fsPromises = (await import('node:fs/promises')).default
    expect(mockToSSG).toHaveBeenCalledWith(app, fsPromises, { dir: 'dist/static' })
  })

  it('should print file names with --plain', async () => {
    setupBasicMocks()
    mockToSSG.mockResolvedValue({ success: true, files: ['static/index.html'] })

    await program.parseAsync(['node', 'test', 'ssg', '--plain', 'test-app.js'])

    expect(consoleLogSpy).toHaveBeenCalledWith('static/index.html')
  })

  it('should print a JSON error when toSSG fails', async () => {
    setupBasicMocks()
    mockToSSG.mockResolvedValue({ success: false, files: [], error: new Error('boom') })

    await program.parseAsync(['node', 'test', 'ssg', 'test-app.js'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('SSG_FAILED')
    expect(parsed.error.message).toBe('boom')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })

  it('should print a JSON error when the entry file is not found', async () => {
    mockModules.existsSync.mockReturnValue(false)
    mockModules.resolve.mockImplementation((cwd: string, path: string) => `${cwd}/${path}`)

    await program.parseAsync(['node', 'test', 'ssg', 'missing.ts'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('ENTRY_NOT_FOUND')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })
})
