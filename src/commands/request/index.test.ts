import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('request command', () => {
  const testDir = join(process.cwd(), 'test-temp')
  const testAppPath = join(testDir, 'test-app.ts')

  beforeAll(() => {
    // Create test directory and app file
    mkdirSync(testDir, { recursive: true })

    const testAppContent = `
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({ message: 'Hello' })
})

app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id, name: 'User ' + id })
})

app.post('/data', async (c) => {
  const body = await c.req.text()
  return c.json({ received: body }, 201, {
    'X-Custom-Header': 'test-value'
  })
})

export default app
`
    writeFileSync(testAppPath, testAppContent)
  })

  afterAll(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should handle GET request', async () => {
    const result = await runCommand(['-P', '/', testAppPath])
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ message: 'Hello' })
  })

  it('should handle GET request with parameters', async () => {
    const result = await runCommand(['-P', '/users/123', testAppPath])
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ id: '123', name: 'User 123' })
  })

  it('should handle POST request with data', async () => {
    const result = await runCommand(['-P', '/data', '-X', 'POST', '-d', 'test data', testAppPath])
    expect(result.status).toBe(201)
    expect(JSON.parse(result.body)).toEqual({ received: 'test data' })
    expect(result.headers['x-custom-header']).toBe('test-value')
  })

  it('should handle custom headers', async () => {
    const result = await runCommand([
      '-P',
      '/data',
      '-X',
      'POST',
      '-d',
      'test data',
      '-H',
      'User-Agent: test-agent',
      '-H',
      'Authorization: Bearer token',
      testAppPath,
    ])
    expect(result.status).toBe(201)
  })
})

async function runCommand(args: string[]): Promise<{
  status: number
  body: string
  headers: Record<string, string>
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['./dist/cli.js', 'request', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout.trim())
        resolve(result)
      } catch (error) {
        reject(new Error(`Failed to parse JSON output: ${error}`))
      }
    })
  })
}
