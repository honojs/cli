import { Command } from 'commander'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type * as RuntimeModule from './runtime.js'

// Mock dependencies
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

vi.mock('./runtime.js', async (importOriginal) => {
  const original = await importOriginal<typeof RuntimeModule>()
  return { ...original, runInRuntime: vi.fn() }
})

vi.mock('./workerd.js', () => ({
  runOnWorkerd: vi.fn(),
}))

import { requestCommand } from './index.js'

vi.mock('../../utils/file.js', () => ({
  getFilenameFromPath: vi.fn(),
  saveFile: vi.fn(),
}))

describe('requestCommand', () => {
  let program: Command
  const spyOnConsole = (method: 'log' | 'warn' | 'error') =>
    vi.spyOn(console, method).mockImplementation(() => {})
  let consoleLogSpy: ReturnType<typeof spyOnConsole>
  let consoleWarnSpy: ReturnType<typeof spyOnConsole>
  let consoleErrorSpy: ReturnType<typeof spyOnConsole>
  const getMockModules = async () => ({
    existsSync: vi.mocked((await import('node:fs')).existsSync),
    realpathSync: vi.mocked((await import('node:fs')).realpathSync),
    readFileSync: vi.mocked((await import('node:fs')).readFileSync),
    resolve: vi.mocked((await import('node:path')).resolve),
  })
  const getMockBuildAndImportApp = async () =>
    vi.mocked((await import('../../utils/build.js')).buildAndImportApp)

  let mockModules: Awaited<ReturnType<typeof getMockModules>>
  let mockBuildAndImportApp: Awaited<ReturnType<typeof getMockBuildAndImportApp>>

  async function* createBuildIterator(app: Hono): AsyncGenerator<Hono> {
    yield app
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
    consoleLogSpy = spyOnConsole('log')
    consoleWarnSpy = spyOnConsole('warn')
    consoleErrorSpy = spyOnConsole('error')

    // Get mocked modules
    mockModules = await getMockModules()
    mockBuildAndImportApp = await getMockBuildAndImportApp()

    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('should output the JSON envelope by default', async () => {
    const mockApp = new Hono()
    const jsonBody = { message: 'Success' }
    mockApp.get('/data', (c) => c.json(jsonBody))
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync(['node', 'test', 'request', '-P', '/data', 'test-app.js'])
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: jsonBody,
      },
    })
  })

  it('should accept the request path as a curl-style argument', async () => {
    const mockApp = new Hono()
    mockApp.post('/data', (c) => c.json({ created: true }))
    setupBasicMocks('test-app.js', mockApp)
    mockModules.existsSync.mockImplementation((p) => String(p).endsWith('test-app.js'))
    await program.parseAsync(['node', 'test', 'request', '-X', 'POST', '/data', 'test-app.js'])
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { created: true },
      },
    })
  })

  it('should suggest -X for a method-like argument', async () => {
    const mockApp = new Hono()
    setupBasicMocks('test-app.js', mockApp)
    mockModules.existsSync.mockReturnValue(false)
    await program.parseAsync(['node', 'test', 'request', 'GET', '/data'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_ARGUMENTS')
    expect(output.error.suggestions).toEqual(['Pass it with -X: hono request -X GET -P /data'])
  })

  it('should error when a positional path conflicts with -P', async () => {
    const mockApp = new Hono()
    setupBasicMocks('test-app.js', mockApp)
    mockModules.existsSync.mockReturnValue(false)
    await program.parseAsync(['node', 'test', 'request', '/a', '-P', '/b'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_ARGUMENTS')
  })

  it('should run a batch from a JSONL file', async () => {
    const mockApp = new Hono()
    mockApp.get('/data', (c) => c.json({ ok: 1 }))
    setupBasicMocks('test-app.js', mockApp)
    mockModules.readFileSync.mockReturnValue('{"path":"/data","expect":200}')
    await program.parseAsync(['node', 'test', 'request', '--batch', 'steps.jsonl', 'test-app.js'])
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        steps: [
          {
            method: 'GET',
            path: '/data',
            status: 200,
            body: { ok: 1 },
            pass: true,
            expect: 200,
          },
        ],
        summary: { total: 1, passed: 1, failed: 0 },
      },
    })
  })

  it('should error when --batch is combined with a per-request option', async () => {
    const mockApp = new Hono()
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync(['node', 'test', 'request', '--batch', '-', '-P', '/a'])
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(output.ok).toBe(false)
    expect(output.error.code).toBe('INVALID_OPTION')
  })

  it('should output a text body as a string in the envelope', async () => {
    const mockApp = new Hono()
    const text = 'Hello, World!'
    mockApp.get('/data', (c) => c.text(text))
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync(['node', 'test', 'request', '-P', '/data', 'test-app.js'])
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: text,
      },
    })
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
      sourcemap: true,
    })

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { message: 'Hello' },
      },
    })
  })

  it('should handle GET request to specific file with watch option', async () => {
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
      sourcemap: true,
    })

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { message: 'Hello' },
      },
    })
  })

  it('should handle JSON response with charset in Content-Type', async () => {
    const mockApp = new Hono()
    const jsonBody = { message: 'Hello JSON with Charset' }
    mockApp.get('/json-charset', (c) =>
      c.body(JSON.stringify(jsonBody), 200, {
        'Content-Type': 'application/json; charset=utf-8',
      })
    )
    setupBasicMocks('test-app.js', mockApp)

    await program.parseAsync(['node', 'test', 'request', '-P', '/json-charset', 'test-app.js'])

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: jsonBody,
      },
    })
  })

  // The output must contain the response body as a nested object,
  // not a double-stringified JSON string.
  it('should return object body in JSON output when response is JSON', async () => {
    const mockApp = new Hono()
    const jsonBody = { foo: 'bar', nested: { a: 1 } }
    mockApp.get('/json-obj', (c) => c.json(jsonBody))
    setupBasicMocks('test-app.js', mockApp)

    await program.parseAsync(['node', 'test', 'request', '-P', '/json-obj', 'test-app.js'])

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: jsonBody,
      },
    })
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

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-custom-header': 'test-value' },
        body: { received: 'test data' },
      },
    })
  })

  it('should handle default app path when no file provided', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Default app' }))

    const expectedPath = 'src/index.js'

    // Override existsSync to only return true for the resolved path of src/index.js
    mockModules.existsSync.mockImplementation((path) => {
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

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { message: 'Default app' },
      },
    })
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

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { auth: 'Bearer token123' },
      },
    })
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

    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { auth: 'Bearer token456', userAgent: 'TestClient/1.0', custom: 'custom-value' },
      },
    })
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
    const output = consoleLogSpy.mock.calls[0][0]
    const result = JSON.parse(output)
    expect(result.ok).toBe(true)
    expect(result.data.status).toBe(200)
    expect(result.data.headers['content-type']).toBe('application/json')
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
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { success: true },
      },
    })
  })

  it('should handle HTML response', async () => {
    const mockApp = new Hono()
    const htmlContent = '<h1>Hello World</h1>'
    mockApp.get('/html', (c) => c.html(htmlContent))
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync(['node', 'test', 'request', '-P', '/html', '--plain', 'test-app.js'])
    expect(consoleLogSpy).toHaveBeenCalledWith(htmlContent)
  })

  it('should handle XML response', async () => {
    const mockApp = new Hono()
    const xmlContent = '<root><message>Hello</message></root>'
    mockApp.get('/xml', (c) => c.body(xmlContent, 200, { 'Content-Type': 'application/xml' }))
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync(['node', 'test', 'request', '-P', '/xml', '--plain', 'test-app.js'])
    expect(consoleLogSpy).toHaveBeenCalledWith(xmlContent)
  })

  it('should warn on binary PNG response', async () => {
    const mockApp = new Hono()
    const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    mockApp.get('/image.png', (c) => c.body(pngData.buffer, 200, { 'Content-Type': 'image/png' }))
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/image.png',
      '--plain',
      'test-app.js',
    ])
    expect(consoleWarnSpy).toHaveBeenCalledWith('Binary output can mess up your terminal.')
    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('should output null body with binary flag for binary response by default', async () => {
    const mockApp = new Hono()
    const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    mockApp.get('/image.png', (c) => c.body(pngData.buffer, 200, { 'Content-Type': 'image/png' }))
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync(['node', 'test', 'request', '-P', '/image.png', 'test-app.js'])
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
      ok: true,
      data: {
        status: 200,
        headers: { 'content-type': 'image/png' },
        body: null,
        binary: true,
      },
    })
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  it('should warn on binary PDF response', async () => {
    const mockApp = new Hono()
    const pdfData = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 0, 0, 0, 0])
    mockApp.get('/document.pdf', (c) =>
      c.body(pdfData.buffer, 200, { 'Content-Type': 'application/pdf' })
    )
    setupBasicMocks('test-app.js', mockApp)
    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/document.pdf',
      '--plain',
      'test-app.js',
    ])
    expect(consoleWarnSpy).toHaveBeenCalledWith('Binary output can mess up your terminal.')
    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('should continue to next build when binary output is detected', async () => {
    const mockApp1 = new Hono()
    const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    mockApp1.get('/resource', (c) => c.body(pngData.buffer, 200, { 'Content-Type': 'image/png' }))

    const mockApp2 = new Hono()
    const text = 'Hello, World!'
    mockApp2.get('/resource', (c) => c.text(text))

    async function* iterator(): AsyncGenerator<Hono> {
      yield mockApp1
      yield mockApp2
    }
    mockBuildAndImportApp.mockReturnValue(iterator())

    mockModules.existsSync.mockReturnValue(true)
    mockModules.realpathSync.mockReturnValue('test-app.js')
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/resource',
      '-w',
      '--plain',
      'test-app.js',
    ])

    expect(consoleWarnSpy).toHaveBeenCalledWith('Binary output can mess up your terminal.')
    expect(consoleLogSpy).toHaveBeenCalledWith(text)
  })

  it('should save JSON response to specified file with -o option', async () => {
    const mockApp = new Hono()
    const jsonBody = { message: 'Saved JSON' }
    mockApp.get('/save-json', (c) => c.json(jsonBody))
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)

    const outputPath = 'output.json'
    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/save-json',
      '-o',
      outputPath,
      'test-app.js',
    ])

    const saved = mockSaveFile.mock.calls[0]
    expect(new TextDecoder().decode(saved[0])).toBe(JSON.stringify(jsonBody))
    expect(saved[1]).toBe(outputPath)
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to ${outputPath}`)
    expect(JSON.parse(consoleLogSpy.mock.calls[0][0]).data.savedTo).toBe(outputPath)
  })

  it('should save binary response to specified file with -o option', async () => {
    const mockApp = new Hono()
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]).buffer
    mockApp.get('/save-binary', (c) =>
      c.body(binaryData, 200, { 'Content-Type': 'application/octet-stream' })
    )
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)

    const outputPath = 'output.bin'
    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/save-binary',
      '-o',
      outputPath,
      'test-app.js',
    ])

    const saved = mockSaveFile.mock.calls[0]
    expect(new Uint8Array(saved[0])).toEqual(new Uint8Array(binaryData))
    expect(saved[1]).toBe(outputPath)
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to ${outputPath}`)
  })

  it('should save response to remote-named file with -O option', async () => {
    const mockApp = new Hono()
    const htmlContent = '<html><body>Hello</body></html>'
    mockApp.get('/index.html', (c) => c.html(htmlContent))
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)
    const mockGetFilenameFromPath = vi.mocked(
      (await import('../../utils/file.js')).getFilenameFromPath
    )
    mockGetFilenameFromPath.mockReturnValue('index.html')

    await program.parseAsync(['node', 'test', 'request', '-P', '/index.html', '-O', 'test-app.js'])

    expect(mockGetFilenameFromPath).toHaveBeenCalledWith('/index.html', 'text/html; charset=UTF-8')
    const saved = mockSaveFile.mock.calls[0]
    expect(new TextDecoder().decode(saved[0])).toBe(htmlContent)
    expect(saved[1]).toBe('index.html')
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to index.html`)
  })

  it('should save binary response to remote-named file with -O option', async () => {
    const mockApp = new Hono()
    const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).buffer
    mockApp.get('/image.png', (c) => c.body(pngData, 200, { 'Content-Type': 'image/png' }))
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)
    const mockGetFilenameFromPath = vi.mocked(
      (await import('../../utils/file.js')).getFilenameFromPath
    )
    mockGetFilenameFromPath.mockReturnValue('image.png')

    await program.parseAsync(['node', 'test', 'request', '-P', '/image.png', '-O', 'test-app.js'])

    expect(mockGetFilenameFromPath).toHaveBeenCalledWith('/image.png', 'image/png')
    const saved = mockSaveFile.mock.calls[0]
    expect(new Uint8Array(saved[0])).toEqual(new Uint8Array(pngData))
    expect(saved[1]).toBe('image.png')
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to image.png`)
  })

  it('should save response to "index" when remote-name option is used with root path', async () => {
    const mockApp = new Hono()
    const htmlContent = '<html><body>Home</body></html>'
    mockApp.get('/', (c) => c.html(htmlContent))
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)
    const mockGetFilenameFromPath = vi.mocked(
      (await import('../../utils/file.js')).getFilenameFromPath
    )
    mockGetFilenameFromPath.mockReturnValue('index')

    await program.parseAsync(['node', 'test', 'request', '-P', '/', '-O', 'test-app.js'])

    expect(mockGetFilenameFromPath).toHaveBeenCalledWith('/', 'text/html; charset=UTF-8')
    const saved = mockSaveFile.mock.calls[0]
    expect(new TextDecoder().decode(saved[0])).toBe(htmlContent)
    expect(saved[1]).toBe('index')
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to index`)
  })

  it('should prioritize -o over -O when both are present', async () => {
    const mockApp = new Hono()
    const textContent = 'Text content'
    mockApp.get('/text.txt', (c) => c.text(textContent))
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)
    const mockGetFilenameFromPath = vi.mocked(
      (await import('../../utils/file.js')).getFilenameFromPath
    )

    const outputPath = 'custom-output.txt'

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/text.txt',
      '-o',
      outputPath,
      '-O',
      'test-app.js',
    ])

    expect(mockGetFilenameFromPath).not.toHaveBeenCalled()
    const saved = mockSaveFile.mock.calls[0]
    expect(new TextDecoder().decode(saved[0])).toBe(textContent)
    expect(saved[1]).toBe(outputPath)
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to ${outputPath}`)
  })

  it('should save the raw response body with -o by default', async () => {
    const mockApp = new Hono()
    const jsonBody = { data: 'filtered' }
    mockApp.get('/filtered-data', (c) => c.json(jsonBody))
    setupBasicMocks('test-app.js', mockApp)

    const mockSaveFile = vi.mocked((await import('../../utils/file.js')).saveFile)
    mockSaveFile.mockResolvedValue(undefined)

    const outputPath = 'filtered-output.json'
    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/filtered-data',
      '-o',
      outputPath,
      'test-app.js',
    ])

    const saved = mockSaveFile.mock.calls[0]
    expect(new TextDecoder().decode(saved[0])).toBe(JSON.stringify(jsonBody))
    expect(saved[1]).toBe(outputPath)
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Saved response to ${outputPath}`)
  })

  it('should include protocol and headers with --include option', async () => {
    const mockApp = new Hono()
    const textBody = 'Hello from Hono!'
    mockApp.get('/text', (c) => c.text(textBody, 200, { 'X-Custom-Header': 'IncludeValue' }))
    setupBasicMocks('test-app.js', mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/text',
      '--plain',
      '-i',
      'test-app.js',
    ])

    const expectedOutput = [
      '200',
      '\x1b[1mcontent-type\x1b[0m: text/plain; charset=UTF-8',
      '\x1b[1mx-custom-header\x1b[0m: IncludeValue',
      '',
      textBody,
    ].join('\n')

    expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput)
  })

  it('should only show protocol and headers with --head option', async () => {
    const mockApp = new Hono()
    const textBody = 'Hello from Hono!'
    mockApp.get('/text', (c) => c.text(textBody, 200, { 'X-Custom-Header': 'HeadValue' }))
    setupBasicMocks('test-app.js', mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/text',
      '--plain',
      '-I',
      'test-app.js',
    ])

    const expectedOutput = [
      '200',
      '\x1b[1mcontent-type\x1b[0m: text/plain; charset=UTF-8',
      '\x1b[1mx-custom-header\x1b[0m: HeadValue',
      '',
    ].join('\n')

    expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput)
  })

  it('should prioritize --head over --include when both are present', async () => {
    const mockApp = new Hono()
    const textBody = 'Hello from Hono!'
    mockApp.get('/text', (c) => c.text(textBody, 200, { 'X-Custom-Header': 'PrioritizeValue' }))
    setupBasicMocks('test-app.js', mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/text',
      '--plain',
      '-i',
      '-I',
      'test-app.js',
    ])

    const expectedOutput = [
      '200',
      '\x1b[1mcontent-type\x1b[0m: text/plain; charset=UTF-8',
      '\x1b[1mx-custom-header\x1b[0m: PrioritizeValue',
      '',
    ].join('\n')

    expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput)
  })

  it('should display JSON body correctly with --plain and --include options', async () => {
    const mockApp = new Hono()
    const jsonBody = { message: 'Hello JSON' }
    mockApp.get('/json-data', (c) => c.json(jsonBody))
    setupBasicMocks('test-app.js', mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-P',
      '/json-data',
      '--plain',
      '-i',
      'test-app.js',
    ])

    const expectedOutput = [
      '200',
      '\x1b[1mcontent-type\x1b[0m: application/json',
      '',
      JSON.stringify(jsonBody, null, 2),
    ].join('\n')

    expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput)
  })

  it('should handle single external option', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Hello' }))

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync(['node', 'test', 'request', '-e', 'pg', 'test-app.js'])

    expect(mockBuildAndImportApp).toHaveBeenCalledWith(expectedPath, {
      external: ['@hono/node-server', 'pg'],
      watch: false,
      sourcemap: true,
    })
  })

  it('should handle multiple external options', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Hello' }))

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '-e',
      'pg',
      '-e',
      'dotenv',
      '-e',
      'prisma',
      'test-app.js',
    ])

    expect(mockBuildAndImportApp).toHaveBeenCalledWith(expectedPath, {
      external: ['@hono/node-server', 'pg', 'dotenv', 'prisma'],
      watch: false,
      sourcemap: true,
    })
  })

  it('should handle long flag name --external', async () => {
    const mockApp = new Hono()
    mockApp.get('/', (c) => c.json({ message: 'Hello' }))

    const expectedPath = 'test-app.js'
    setupBasicMocks(expectedPath, mockApp)

    await program.parseAsync([
      'node',
      'test',
      'request',
      '--external',
      'pg',
      '--external',
      'dotenv',
      'test-app.js',
    ])

    expect(mockBuildAndImportApp).toHaveBeenCalledWith(expectedPath, {
      external: ['@hono/node-server', 'pg', 'dotenv'],
      watch: false,
      sourcemap: true,
    })
  })

  describe('Content-Type JSON detection', () => {
    const jsonString = '{"foo":"bar"}'
    const formattedJsonString = JSON.stringify(JSON.parse(jsonString), null, 2)

    const matchingTypes = [
      'application/json',
      'APPLICATION/JSON',
      'application/json; charset=utf-8',
      'application/json; charset=UTF-8; boundary=something',
      'application/ld+json',
      'application/hal+json',
      'application/vnd.api+json',
      'application/merge-patch+json',
      'application/problem+json',
      'application/geo+json',
    ]

    const nonMatchingTypes = [
      'application/jsonx',
      'application/jsonapi',
      'application/json+ld',
      'application/json+hal',
      'text/json',
      'text/plain',
      'application/xml',
      'text/plain; application/json',
    ]

    matchingTypes.forEach((contentType) => {
      it(`should format JSON for Content-Type: ${contentType}`, async () => {
        const mockApp = new Hono()
        mockApp.get('/test', (c) => c.body(jsonString, 200, { 'Content-Type': contentType }))
        setupBasicMocks('test-app.js', mockApp)

        await program.parseAsync([
          'node',
          'test',
          'request',
          '-P',
          '/test',
          '--plain',
          'test-app.js',
        ])

        expect(consoleLogSpy).toHaveBeenCalledWith(formattedJsonString)
      })
    })

    nonMatchingTypes.forEach((contentType) => {
      it(`should NOT format JSON for Content-Type: ${contentType}`, async () => {
        const mockApp = new Hono()
        mockApp.get('/test', (c) => c.body(jsonString, 200, { 'Content-Type': contentType }))
        setupBasicMocks('test-app.js', mockApp)

        await program.parseAsync([
          'node',
          'test',
          'request',
          '-P',
          '/test',
          '--plain',
          'test-app.js',
        ])

        expect(consoleLogSpy).toHaveBeenCalledWith(jsonString)
      })
    })
  })

  it('should print a JSON error when the entry file is not found', async () => {
    mockModules.existsSync.mockReturnValue(false)
    mockModules.resolve.mockImplementation((cwd: string, path: string) => `${cwd}/${path}`)

    await program.parseAsync(['node', 'test', 'request', 'missing.ts'])

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('ENTRY_NOT_FOUND')
    expect(parsed.error.suggestions.length).toBeGreaterThan(0)
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })

  describe('stdin', () => {
    it('should read the body from a file with -d @file', async () => {
      const mockApp = new Hono()
      mockApp.post('/echo', async (c) => c.json({ received: await c.req.text() }))
      setupBasicMocks('test-app.js', mockApp)
      mockModules.readFileSync.mockReturnValue('{"name":"Alice"}')

      await program.parseAsync([
        'node',
        'test',
        'request',
        '-P',
        '/echo',
        '-X',
        'POST',
        '-d',
        '@body.json',
        'test-app.js',
      ])

      expect(mockModules.readFileSync).toHaveBeenCalledWith('body.json', 'utf-8')
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.data.body).toEqual({ received: '{"name":"Alice"}' })
    })

    it('should read the body from stdin with -d @-', async () => {
      const mockApp = new Hono()
      mockApp.post('/echo', async (c) => c.json({ received: await c.req.text() }))
      setupBasicMocks('test-app.js', mockApp)
      mockModules.readFileSync.mockReturnValue('from stdin')

      await program.parseAsync([
        'node',
        'test',
        'request',
        '-P',
        '/echo',
        '-X',
        'POST',
        '-d',
        '@-',
        'test-app.js',
      ])

      expect(mockModules.readFileSync).toHaveBeenCalledWith(0, 'utf-8')
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.data.body).toEqual({ received: 'from stdin' })
    })

    it('should read the app code from stdin with -', async () => {
      const mockApp = new Hono()
      mockApp.get('/', (c) => c.text('from code'))
      mockModules.readFileSync.mockReturnValue('export default app')
      mockBuildAndImportApp.mockReturnValue(createBuildIterator(mockApp))

      await program.parseAsync(['node', 'test', 'request', '-', '-P', '/'])

      expect(mockModules.readFileSync).toHaveBeenCalledWith(0, 'utf-8')
      expect(mockBuildAndImportApp).toHaveBeenCalledWith(
        { code: 'export default app' },
        { external: ['@hono/node-server'] }
      )
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.data.body).toBe('from code')
    })

    it('should wrap stdin code without a default export', async () => {
      const mockApp = new Hono()
      mockApp.get('/', (c) => c.text('wrapped'))
      mockModules.readFileSync.mockReturnValue('app.get("/", (c) => c.text("wrapped"))')
      mockBuildAndImportApp.mockReturnValue(createBuildIterator(mockApp))

      await program.parseAsync(['node', 'test', 'request', '-', '-P', '/'])

      expect(mockBuildAndImportApp).toHaveBeenCalledWith(
        {
          code:
            "import { Hono } from 'hono'\n" +
            'const app = new Hono()\n' +
            'app.get("/", (c) => c.text("wrapped"))\n' +
            'export default app\n',
        },
        { external: ['@hono/node-server'] }
      )
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.data.body).toBe('wrapped')
    })

    it('should reject - together with -d @-', async () => {
      await program.parseAsync(['node', 'test', 'request', '-', '-d', '@-'])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.ok).toBe(false)
      expect(parsed.error.code).toBe('INVALID_OPTION')
      expect(process.exitCode).toBe(1)
      process.exitCode = undefined
    })

    it('should reject - together with --watch', async () => {
      await program.parseAsync(['node', 'test', 'request', '-', '-w'])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.ok).toBe(false)
      expect(parsed.error.code).toBe('INVALID_OPTION')
      expect(process.exitCode).toBe(1)
      process.exitCode = undefined
    })
  })

  describe('trace', () => {
    it('should include matchedRoutes with --trace', async () => {
      const mockApp = new Hono()
      mockApp.use(async function auth(_c, next) {
        await next()
      })
      mockApp.get('/api/users/:id', function getUser(c) {
        return c.json({ id: c.req.param('id') })
      })
      setupBasicMocks('test-app.js', mockApp)

      await program.parseAsync([
        'node',
        'test',
        'request',
        '-P',
        '/api/users/123',
        '--trace',
        'test-app.js',
      ])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.data.body).toEqual({ id: '123' })
      expect(parsed.data.matchedRoutes).toEqual([
        { method: 'ALL', path: '/*', name: 'auth', isMiddleware: true },
        {
          method: 'GET',
          path: '/api/users/:id',
          name: 'getUser',
          isMiddleware: false,
          responded: true,
        },
      ])
    })

    it('should reject --trace with --plain', async () => {
      await program.parseAsync(['node', 'test', 'request', '--trace', '--plain', 'test-app.js'])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.ok).toBe(false)
      expect(parsed.error.code).toBe('INVALID_OPTION')
      expect(process.exitCode).toBe(1)
      process.exitCode = undefined
    })
  })

  describe('runtime', () => {
    const getMocks = async () => ({
      runInRuntime: vi.mocked((await import('./runtime.js')).runInRuntime),
    })

    it('should run the app on the selected runtime', async () => {
      const { runInRuntime } = await getMocks()
      mockModules.existsSync.mockReturnValue(true)
      mockModules.realpathSync.mockReturnValue('test-app.js')
      mockModules.resolve.mockImplementation((cwd: string, path: string) => `${cwd}/${path}`)
      runInRuntime.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        bodyBase64: Buffer.from('{"hi":true}').toString('base64'),
      })

      await program.parseAsync([
        'node',
        'test',
        'request',
        '-P',
        '/api',
        '-H',
        'X-Key: abc',
        '--runtime',
        'bun',
        'test-app.js',
      ])

      expect(runInRuntime).toHaveBeenCalledWith('bun', 'test-app.js', [], {
        path: '/api',
        method: 'GET',
        headers: { 'X-Key': 'abc' },
      })
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed).toEqual({
        ok: true,
        data: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { hi: true },
          runtime: 'bun',
        },
      })
    })

    it('should reject an unknown runtime', async () => {
      await program.parseAsync(['node', 'test', 'request', '--runtime', 'php', 'test-app.js'])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.ok).toBe(false)
      expect(parsed.error.code).toBe('INVALID_OPTION')
      expect(process.exitCode).toBe(1)
      process.exitCode = undefined
    })

    it('should run the app on workerd with the wrangler config', async () => {
      const runOnWorkerd = vi.mocked((await import('./workerd.js')).runOnWorkerd)
      const body = JSON.stringify({ who: 'workerd' })
      runOnWorkerd.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body,
        response: new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      })

      await program.parseAsync(['node', 'test', 'request', '-P', '/api', '--runtime', 'workerd'])

      expect(runOnWorkerd).toHaveBeenCalledWith({ path: '/api', method: 'GET', headers: {} })
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed).toEqual({
        ok: true,
        data: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { who: 'workerd' },
          runtime: 'workerd',
        },
      })
    })

    it('should reject a file argument with workerd', async () => {
      await program.parseAsync(['node', 'test', 'request', '--runtime', 'workerd', 'src/index.ts'])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.ok).toBe(false)
      expect(parsed.error.code).toBe('INVALID_OPTION')
      process.exitCode = undefined
    })

    it('should reject --runtime bun with --watch or --trace', async () => {
      await program.parseAsync(['node', 'test', 'request', '--runtime', 'bun', '-w', 'a.ts'])
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0]).error.code).toBe('INVALID_OPTION')

      await program.parseAsync(['node', 'test', 'request', '--runtime', 'deno', '--trace', 'a.ts'])
      expect(JSON.parse(consoleLogSpy.mock.calls[1][0]).error.code).toBe('INVALID_OPTION')
      process.exitCode = undefined
    })
  })

  describe('404 trace suggestion', () => {
    it('should suggest --trace on a 404 response', async () => {
      const mockApp = new Hono()
      mockApp.get('/exists', (c) => c.text('ok'))
      setupBasicMocks('test-app.js', mockApp)

      await program.parseAsync(['node', 'test', 'request', '-P', '/missing', 'test-app.js'])

      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0])
      expect(parsed.data.status).toBe(404)
      expect(parsed.data.suggestions).toEqual([
        'See which routes matched: hono request -P /missing --trace',
      ])
    })

    it('should not suggest --trace on a success or when tracing already', async () => {
      const mockApp = new Hono()
      mockApp.get('/exists', (c) => c.text('ok'))
      setupBasicMocks('test-app.js', mockApp)

      await program.parseAsync(['node', 'test', 'request', '-P', '/exists', 'test-app.js'])
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0]).data.suggestions).toBeUndefined()

      setupBasicMocks('test-app.js', mockApp)
      await program.parseAsync([
        'node',
        'test',
        'request',
        '-P',
        '/missing',
        '--trace',
        'test-app.js',
      ])
      expect(JSON.parse(consoleLogSpy.mock.calls[1][0]).data.suggestions).toBeUndefined()
    })
  })
})
