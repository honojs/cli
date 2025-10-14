import { Command } from 'commander'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  extname: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('node:url', () => ({
  pathToFileURL: vi.fn(),
}))

vi.mock('esbuild', () => ({
  build: vi.fn(),
}))

import { requestCommand } from './index.js'

describe('requestCommand', () => {
  let program: Command
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let mockModules: any

  const setupBasicMocks = (appPath: string, mockApp: Hono) => {
    mockModules.existsSync.mockReturnValue(true)
    mockModules.realpathSync.mockReturnValue(appPath)
    mockModules.extname.mockReturnValue('.js')
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })
    const absolutePath = appPath.startsWith('/') ? appPath : `${process.cwd()}/${appPath}`
    mockModules.pathToFileURL.mockReturnValue(new URL(`file://${absolutePath}`))
    vi.doMock(absolutePath, () => ({ default: mockApp }))
  }

  beforeEach(async () => {
    program = new Command()
    requestCommand(program)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Get mocked modules
    mockModules = {
      existsSync: vi.mocked((await import('node:fs')).existsSync),
      realpathSync: vi.mocked((await import('node:fs')).realpathSync),
      extname: vi.mocked((await import('node:path')).extname),
      resolve: vi.mocked((await import('node:path')).resolve),
      pathToFileURL: vi.mocked((await import('node:url')).pathToFileURL),
    }

    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('should handle GET request to specific file', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Hello' }))

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync(['node', 'test', 'request', '-P', '/', 'test-app.js'])

    // Verify resolve was called with correct arguments
    expect(mockModules.resolve).toHaveBeenCalledWith(process.cwd(), 'test-app.js')

    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          status: 200,
          body: '{"message":"Hello"}',
          headers: { 'content-type': 'application/json' },
        },
        null,
        2
      )
    )
  })

  it('should handle POST request with data', async () => {
    const mockApp = new Hono()
    mockApp.post('/data', async (c) => {
      const body = await c.req.text()
      return c.json({ received: body }, 201, { 'X-Custom-Header': 'test-value' })
    })

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/data',
      '-X',
      'POST',
      '-d',
      'test data',
      'test-app.js',
    ])

    // Verify resolve was called with correct arguments
    expect(mockModules.resolve).toHaveBeenCalledWith(process.cwd(), 'test-app.js')

    const expectedOutput = JSON.stringify(
      {
        status: 201,
        body: '{"received":"test data"}',
        headers: { 'content-type': 'application/json', 'x-custom-header': 'test-value' },
      },
      null,
      2
    )

    expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput)
  })

  it('should handle default app path when no file provided', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Default app' }))

    const expectedPath = 'src/index.js'

    // Override existsSync to only return true for the resolved path of src/index.js
    mockModules.existsSync.mockImplementation((path: string) => {
      const resolvedPath = `${process.cwd()}/${expectedPath}`
      return path === resolvedPath
    })
    mockModules.realpathSync.mockReturnValue(expectedPath)
    mockModules.extname.mockReturnValue('.js')
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })
    const absolutePath = `${process.cwd()}/${expectedPath}`
    mockModules.pathToFileURL.mockReturnValue(new URL(`file://${absolutePath}`))
    vi.doMock(absolutePath, () => ({ default: mockApp }))

    await program.parseAsync(['node', 'test', 'request'])

    // Verify resolve was called with correct arguments for default candidates
    expect(mockModules.resolve).toHaveBeenCalledWith(process.cwd(), 'src/index.ts')
    expect(mockModules.resolve).toHaveBeenCalledWith(process.cwd(), 'src/index.tsx')
    expect(mockModules.resolve).toHaveBeenCalledWith(process.cwd(), 'src/index.js')

    const expectedOutput = JSON.stringify(
      {
        status: 200,
        body: '{"message":"Default app"}',
        headers: { 'content-type': 'application/json' },
      },
      null,
      2
    )

    expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput)
  })
})
