import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appLogsToStderr, logsToStderr } from './app-logs.js'

describe('appLogsToStderr', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should send console.log from the app to stderr', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = new Hono()
    app.use(async (_c, next) => {
      console.log('<-- GET /')
      await next()
    })
    app.get('/', (c) => c.text('hi'))

    const res = await appLogsToStderr(app).request('/')

    expect(await res.text()).toBe('hi')
    expect(error).toHaveBeenCalledWith('<-- GET /')
    expect(log).not.toHaveBeenCalled()
    // The CLI's own output still goes to stdout
    console.log('result')
    expect(log).toHaveBeenCalledWith('result')
  })

  it('should restore console when the app throws', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(
      logsToStderr(() => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    console.log('after')
    expect(log).toHaveBeenCalledWith('after')
  })
})
