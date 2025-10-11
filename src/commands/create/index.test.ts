import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { createCommand } from './index.js'

describe('createCommand', () => {
  let program: Command
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let processExitSpy: any

  beforeEach(() => {
    program = new Command()
    createCommand(program)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
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

    await program.parseAsync(['node', 'test', 'create'])

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to execute npm: spawn ENOENT')
    expect(processExitSpy).toHaveBeenCalledWith(1)
  })

  it('should exit with the same code as npm', async () => {
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

    await program.parseAsync(['node', 'test', 'create'])

    expect(processExitSpy).toHaveBeenCalledWith(1)
  })
})
