import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { createCommand } from './index.js'

describe('createCommand', () => {
  let program: Command
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    program = new Command()
    createCommand(program)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('should spawn npm create hono@latest with no arguments', async () => {
    const { spawn } = await import('node:child_process')
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'exit') {
          callback(0)
        }
        return mockChildProcess
      }),
    }
    vi.mocked(spawn).mockReturnValue(mockChildProcess as never)

    await program.parseAsync(['node', 'test', 'create'])

    // Currently, supporting only npm
    expect(spawn).toHaveBeenCalledWith('npm', ['create', 'hono@latest'], {
      stdio: 'inherit',
    })
  })

  it('should spawn npm create hono@latest with target directory', async () => {
    const { spawn } = await import('node:child_process')
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'exit') {
          callback(0)
        }
        return mockChildProcess
      }),
    }
    vi.mocked(spawn).mockReturnValue(mockChildProcess as never)

    await program.parseAsync(['node', 'test', 'create', 'my-app'])

    expect(spawn).toHaveBeenCalledWith('npm', ['create', 'hono@latest', 'my-app'], {
      stdio: 'inherit',
    })
  })

  it('should handle spawn error gracefully', async () => {
    const { spawn } = await import('node:child_process')
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          callback(new Error('spawn ENOENT'))
        }
        return mockChildProcess
      }),
    }
    vi.mocked(spawn).mockReturnValue(mockChildProcess as never)

    await expect(program.parseAsync(['node', 'test', 'create'])).rejects.toThrow('Failed to execute npm: spawn ENOENT')

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to execute npm: spawn ENOENT')
  })

  it('should throw error when npm exits with non-zero code', async () => {
    const { spawn } = await import('node:child_process')
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'exit') {
          callback(1)
        }
        return mockChildProcess
      }),
    }
    vi.mocked(spawn).mockReturnValue(mockChildProcess as never)

    await expect(program.parseAsync(['node', 'test', 'create'])).rejects.toThrow('npm create hono@latest exited with code 1')
  })
})
