import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mock dependencies
vi.mock('@hono/node-server', () => ({
  serve: vi.fn(),
}))

vi.mock('hono/dev', () => ({
  showRoutes: vi.fn(),
}))

vi.mock('./builtin-map.js', () => ({
  builtinMap: {
    cors: 'hono/cors',
    logger: 'hono/logger',
    proxy: 'hono/proxy',
    html: 'hono/html',
    getCookie: 'hono/cookie',
    basicAuth: 'hono/basic-auth',
  },
}))

import { serveCommand } from './index.js'

describe('serveCommand', () => {
  let program: Command
  let mockEsbuild: any
  let mockModules: any
  let mockServe: any
  let mockShowRoutes: any
  let capturedFetchFunction: any

  beforeEach(async () => {
    program = new Command()
    serveCommand(program)

    mockServe = vi.mocked((await import('@hono/node-server')).serve)
    mockShowRoutes = vi.mocked((await import('hono/dev')).showRoutes)

    mockModules = {
      existsSync: vi.fn(),
      resolve: vi.fn(),
    }

    // Capture the fetch function passed to serve
    mockServe.mockImplementation((options: any, callback?: any) => {
      capturedFetchFunction = options.fetch
      if (callback) {
        callback({ port: options.port })
      }
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start server with default port', async () => {
    await program.parseAsync(['node', 'test', 'serve'])

    // Verify serve was called with default port 7070
    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
        port: 7070,
      }),
      expect.any(Function)
    )
  })

  it('should start server with custom port', async () => {
    await program.parseAsync(['node', 'test', 'serve', '-p', '8080'])

    // Verify serve was called with custom port
    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
        port: 8080,
      }),
      expect.any(Function)
    )
  })

  it('should start server with custom port 0 by allocating a ephemeral port', async () => {
    mockModules.existsSync.mockReturnValue(false)
    mockModules.resolve.mockImplementation((cwd: string, path: string) => {
      return `${cwd}/${path}`
    })

    await program.parseAsync(['node', 'test', 'serve', '-p', '0'])

    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
        port: 0,
      }),
      expect.any(Function)
    )
  })

  it('should serve app that responds correctly to requests', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'hono-cli-serve-test'))
    mkdirSync(appDir, { recursive: true })
    const appFile = join(appDir, 'app.ts')
    writeFileSync(
      appFile,
      `
import { Hono } from 'hono'

const app = new Hono()
app.get('/', (c) => c.text('Hello World'))
app.get('/api', (c) => c.json({ message: 'API response' }))

export default app
`
    )
    writeFileSync(
      join(appDir, 'package.json'),
      JSON.stringify({
        type: 'module',
        dependencies: {
          hono: 'latest',
        },
      })
    )
    process.chdir(appDir)
    await new Promise<void>((resolve) => {
      const child = execFile('npm', ['install'])
      child.on('exit', () => {
        resolve()
      })
    })

    await program.parseAsync(['node', 'test', 'serve', appFile])

    // Test the captured fetch function
    const rootRequest = new Request('http://localhost:7070/')
    const rootResponse = await capturedFetchFunction(rootRequest)
    expect(await rootResponse.text()).toBe('Hello World')

    const apiRequest = new Request('http://localhost:7070/api')
    const apiResponse = await capturedFetchFunction(apiRequest)
    const apiData = await apiResponse.json()
    expect(apiData).toEqual({ message: 'API response' })
  })

  it('should return 404 for non-existent routes when no app file exists', async () => {
    await program.parseAsync(['node', 'test', 'serve'])

    // Test 404 behavior with default empty app
    const request = new Request('http://localhost:7070/non-existent')
    const response = await capturedFetchFunction(request)
    expect(response.status).toBe(404)
  })

  it('should create default empty app when no entry argument provided', async () => {
    await program.parseAsync(['node', 'test', 'serve'])

    // Verify serve was called
    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
        port: 7070,
      }),
      expect.any(Function)
    )

    // Test that the default app returns 404 for any route
    const rootRequest = new Request('http://localhost:7070/')
    const rootResponse = await capturedFetchFunction(rootRequest)
    expect(rootResponse.status).toBe(404)
  })

  it('should handle typical use case: basicAuth + proxy to ramen-api.dev', async () => {
    // Mock basicAuth middleware
    const mockBasicAuth = vi.fn().mockImplementation(() => {
      return async (c: any, next: any) => {
        const auth = c.req.header('Authorization')
        if (!auth || auth !== 'Basic aG9ubzpob25v') {
          // hono:hono in base64
          return c.text('Unauthorized', 401)
        }
        await next()
      }
    })

    // Mock proxy helper
    const mockProxy = vi.fn().mockImplementation((url) => {
      if (url.includes('/shops')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              shops: [
                { id: 1, name: 'Ramen Taro', location: 'Tokyo' },
                { id: 2, name: 'Noodle House', location: 'Osaka' },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }
      return Promise.resolve(new Response('API endpoint not found', { status: 404 }))
    })

    vi.doMock('hono/basic-auth', () => ({ basicAuth: mockBasicAuth }))
    vi.doMock('hono/proxy', () => ({ proxy: mockProxy }))

    await program.parseAsync([
      'node',
      'test',
      'serve',
      '--use',
      'basicAuth({username: "hono", password: "hono"})',
      '--use',
      '(c) => proxy(`https://ramen-api.dev${new URL(c.req.url).pathname}`)',
    ])

    // Test without auth - should get 401
    const unauthorizedRequest = new Request('http://localhost:7070/shops')
    const unauthorizedResponse = await capturedFetchFunction(unauthorizedRequest)
    expect(unauthorizedResponse.status).toBe(401)
    expect(await unauthorizedResponse.text()).toBe('Unauthorized')

    // Test with valid auth - shops endpoint
    const shopsRequest = new Request('http://localhost:7070/shops', {
      headers: { Authorization: 'Basic aG9ubzpob25v' },
    })
    const shopsResponse = await capturedFetchFunction(shopsRequest)
    expect(shopsResponse.status).toBe(200)
    const shopsData = await shopsResponse.json()
    expect(shopsData.shops).toHaveLength(2)
    expect(shopsData.shops[0].name).toBe('Ramen Taro')

    // Test with valid auth - unknown endpoint
    const unknownRequest = new Request('http://localhost:7070/unknown', {
      headers: { Authorization: 'Basic aG9ubzpob25v' },
    })
    const unknownResponse = await capturedFetchFunction(unknownRequest)
    expect(unknownResponse.status).toBe(404)
    expect(await unknownResponse.text()).toBe('API endpoint not found')
  })

  describe('port validation', () => {
    it.each(['-1', '65536', '2048GB', 'invalid'])(
      'should throw error when port is invalid %s',
      async (port) => {
        mockModules.existsSync.mockReturnValue(false)
        mockModules.resolve.mockImplementation((cwd: string, path: string) => {
          return `${cwd}/${path}`
        })

        expect(program.parseAsync(['node', 'test', 'serve', '-p', port])).rejects.toThrow(
          `Port must be a number between 0 and 65535. Received: ${port}\n`
        )
      }
    )
  })
})
