import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { parseRunnerOutput } from '../request/runtime'
import { buildBenchBody } from './engine'
import type { RouteResult } from './engine'

const MARKER = '__TEST_BENCH__'

const execNode = (code: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = execFile(process.execPath, ['--input-type=module'], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr))
        return
      }
      resolve(stdout)
    })
    child.stdin?.end(code)
  })

describe('buildBenchBody', () => {
  it('should measure the targets and report the stats', { timeout: 30000 }, async () => {
    const app = `const app = { fetch: () => new Response('ok') }`
    const body = buildBenchBody(
      [
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/users/1' },
      ],
      { duration: 100, warmup: 5 },
      MARKER
    )
    const stdout = await execNode(`${app}\n${body}`)
    const { routes } = parseRunnerOutput<{ routes: RouteResult[] }>(stdout, MARKER, 'node')

    expect(routes).toHaveLength(2)
    for (const route of routes) {
      expect(route.requests).toBeGreaterThan(0)
      expect(route.rps).toBeGreaterThan(0)
      expect(route.latency.p50).toBeGreaterThan(0)
      expect(route.latency.p50).toBeLessThanOrEqual(route.latency.p99)
    }
    expect(routes[0].path).toBe('/')
    expect(routes[1].path).toBe('/users/1')
  })
})
