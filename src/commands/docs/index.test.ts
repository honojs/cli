import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))

// Mock os
vi.mock('node:os', () => ({
  platform: vi.fn(),
}))

import { docsCommand } from './index.js'

describe('docsCommand', () => {
  let program: Command
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    program = new Command()
    docsCommand(program)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('should use "open" command on macOS', async () => {
    const { exec } = await import('node:child_process')
    const { platform } = await import('node:os')

    vi.mocked(platform).mockReturnValue('darwin')
    vi.mocked(exec).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1]
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as never
    }) as never)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(exec).toHaveBeenCalledWith('open https://hono.dev', expect.any(Function))
    expect(consoleLogSpy).toHaveBeenCalledWith('Opening https://hono.dev in your browser...')
  })

  it('should use "start" command on Windows', async () => {
    const { exec } = await import('node:child_process')
    const { platform } = await import('node:os')

    vi.mocked(platform).mockReturnValue('win32')
    vi.mocked(exec).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1]
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as never
    }) as never)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(exec).toHaveBeenCalledWith('start https://hono.dev', expect.any(Function))
  })

  it('should use "xdg-open" command on Linux', async () => {
    const { exec } = await import('node:child_process')
    const { platform } = await import('node:os')

    vi.mocked(platform).mockReturnValue('linux')
    vi.mocked(exec).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1]
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as never
    }) as never)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(exec).toHaveBeenCalledWith('xdg-open https://hono.dev', expect.any(Function))
  })

  it('should handle errors gracefully', async () => {
    const { exec } = await import('node:child_process')
    const { platform } = await import('node:os')

    vi.mocked(platform).mockReturnValue('darwin')
    const error = new Error('Command failed')
    vi.mocked(exec).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1]
      if (typeof callback === 'function') {
        callback(error, '', '')
      }
      return {} as never
    }) as never)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to open browser: Command failed')
    expect(consoleLogSpy).toHaveBeenCalledWith('Please visit: https://hono.dev')
  })
})
