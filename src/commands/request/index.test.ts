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

import { requestCommand } from './index.js'

describe('requestCommand', () => {
  let program: Command
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let mockModules: any
  let mockBuildAndImportApp: any

  const createBuildIterator = (app: Hono) => {
    const iterator = {
      next: vi
        .fn()
        .mockResolvedValueOnce({ value: app, done: false })
        .mockResolvedValueOnce({ value: undefined, done: true }),
      return: vi.fn().mockResolvedValue({ value: undefined, done: true }),
      [Symbol.asyncIterator]() {
        return this
      },
    }
    return iterator
  }

  const setupBasicMocks = (appPath: string, mockApp: Hono) => {
    mockModules.existsSync.mockReturnValue(true)
    mockModules.realpathSync.mockReturnValue(appPath)
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })
    mockBuildAndImportApp.mockReturnValue(createBuildIterator(mockApp))
  }

  beforeEach(async () => {
    program = new Command()
    requestCommand(program)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Get mocked modules
    mockModules = {
      existsSync: vi.mocked((await import('node:fs')).existsSync),
      realpathSync: vi.mocked((await import('node:fs')).realpathSync),
      resolve: vi.mocked((await import('node:path')).resolve),
    }

    mockBuildAndImportApp = vi.mocked((await import('../../utils/build.js')).buildAndImportApp)

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

    expect(mockBuildAndImportApp).toHaveBeenCalledWith(expectedPath, {
      external: ['@hono/node-server'],
      watch: false,
    })

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

  it('should handle GET request to specific file', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Hello' }))

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync(['node', 'test', 'request', '-w', '-P', '/', 'test-app.js'])

    // Verify resolve was called with correct arguments
    expect(mockModules.resolve).toHaveBeenCalledWith(process.cwd(), 'test-app.js')

    expect(mockBuildAndImportApp).toHaveBeenCalledWith(expectedPath, {
      external: ['@hono/node-server'],
      watch: true,
    })

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
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })
    mockBuildAndImportApp.mockReturnValue(createBuildIterator(mockApp))

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

  it('should handle single header option correctly', async () => {
    const mockApp = new Hono()
    mockApp.get('/api/test', (c) => {
      const auth = c.req.header('Authorization')
      if (!auth) {
        return c.text('No auth header', 400)
      }
      return c.json({ auth })
    })

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/api/test',
      '-H',
      'Authorization: Bearer token123',
      'test-app.js',
    ])

    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          status: 200,
          body: '{"auth":"Bearer token123"}',
          headers: { 'content-type': 'application/json' },
        },
        null,
        2
      )
    )
  })

  it('should handle multiple header options correctly', async () => {
    const mockApp = new Hono()
    mockApp.get('/api/multi', (c) => {
      const auth = c.req.header('Authorization')
      const userAgent = c.req.header('User-Agent')
      const custom = c.req.header('X-Custom-Header')
      return c.json({ auth, userAgent, custom })
    })

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/api/multi',
      '-H',
      'Authorization: Bearer token456',
      '-H',
      'User-Agent: TestClient/1.0',
      '-H',
      'X-Custom-Header: custom-value',
      'test-app.js',
    ])

    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          status: 200,
          body: '{"auth":"Bearer token456","userAgent":"TestClient/1.0","custom":"custom-value"}',
          headers: { 'content-type': 'application/json' },
        },
        null,
        2
      )
    )
  })

  it('should handle no header options correctly', async () => {
    const mockApp = new Hono()
    mockApp.get('/api/noheader', (c) => {
      const headers = Object.fromEntries(c.req.raw.headers.entries())
      return c.json({ receivedHeaders: headers })
    })

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync(['node', 'test', 'request', '-P', '/api/noheader', 'test-app.js'])

    // Should not include any custom headers, only default ones
    const output = consoleLogSpy.mock.calls[0][0] as string
    const result = JSON.parse(output)
    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe('application/json')
  })

  it('should handle malformed header gracefully', async () => {
    const mockApp = new Hono()
    mockApp.get('/api/malformed', (c) => {
      return c.json({ success: true })
    })

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/api/malformed',
      '-H',
      'MalformedHeader', // Missing colon
      '-H',
      'ValidHeader: value',
      'test-app.js',
    ])

    // Should still work, malformed header is ignored
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          status: 200,
          body: '{"success":true}',
          headers: { 'content-type': 'application/json' },
        },
        null,
        2
      )
    )
  })
})
