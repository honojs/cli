import { afterEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { isVoidProject, loadVoidApp, startVite } from './vite'

const FIXTURE = join(import.meta.dirname, 'fixtures/vite')
const VOID_FIXTURE = join(import.meta.dirname, 'fixtures/void')

describe('startVite', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should send requests through the Vite dev server', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(FIXTURE)
    const log = vi.spyOn(console, 'log')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const target = await startVite()
    try {
      const res = await target.request(
        new Request('http://localhost/api?q=1', { method: 'POST', body: 'hi' })
      )
      expect(res.status).toBe(200)
      // The app sees the host of the request, not the random port
      expect(await res.json()).toEqual({
        method: 'POST',
        url: '/api?q=1',
        host: 'localhost',
        body: 'hi',
      })
      expect(res.headers.get('connection')).toBeNull()

      const redirect = await target.request(new Request('http://localhost/redirect'))
      expect(redirect.status).toBe(302)
      expect(redirect.headers.get('location')).toBe('/')

      const cookies = await target.request(new Request('http://localhost/cookies'))
      expect(cookies.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    } finally {
      await target.dispose()
    }
    // The app logs go to stderr, not to stdout
    expect(error).toHaveBeenCalledWith('from app')
    expect(error).toHaveBeenCalledWith('from app console')
    expect(log).not.toHaveBeenCalled()
  })

  it('should load the Hono app of a Void project, which has no entry file', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(VOID_FIXTURE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(isVoidProject()).toBe(true)
    const target = await startVite()
    try {
      const app = await loadVoidApp(target)
      expect(app.routes.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/hello'])
    } finally {
      await target.dispose()
    }
  })

  it('should not take a project without void for a Void project', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(FIXTURE)
    expect(isVoidProject()).toBe(false)
  })
})
