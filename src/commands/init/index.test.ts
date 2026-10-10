import { downloadTemplate } from '@bluwy/giget-core'
import select from '@inquirer/select'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@bluwy/giget-core', () => ({ downloadTemplate: vi.fn(async () => {}) }))
vi.mock('@inquirer/select', () => ({ default: vi.fn(async () => 'nodejs') }))
vi.mock('./install.js', () => ({ install: vi.fn(async () => {}) }))

import { install } from './install.js'
import { initCommand } from './index.js'

describe('initCommand', () => {
  const cwd = process.cwd()
  const isTTY = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY }
  let log: ReturnType<typeof vi.spyOn>

  const run = async (tty: boolean, ...args: string[]) => {
    process.stdin.isTTY = tty
    process.stdout.isTTY = tty
    const program = new Command()
    initCommand(program)
    await program.parseAsync(['node', 'test', 'init', ...args])
    return JSON.parse(log.mock.calls[0][0] as string)
  }

  beforeEach(() => {
    process.chdir(mkdtempSync(join(tmpdir(), 'hono-init-')))
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.chdir(cwd)
    process.stdin.isTTY = isTTY.stdin
    process.stdout.isTTY = isTTY.stdout
    process.exitCode = undefined
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('should let a human pick a template in a terminal', async () => {
    const output = await run(true)
    expect(select).toHaveBeenCalled()
    expect(output.data.template).toBe('nodejs')
    expect(vi.mocked(downloadTemplate).mock.calls[0][0]).toContain('templates/nodejs#')
  })

  it('should install with --install, and only then', async () => {
    const output = await run(false, '--template', 'nodejs', '--install')
    expect(install).toHaveBeenCalledWith(expect.any(String), process.cwd())
    expect(output.data.installed).toBeDefined()
    expect(output.data.suggestions).toEqual(['Then check the app: hono request /'])
    vi.mocked(install).mockClear()
    log.mockClear()
    const plain = await run(false, '--template', 'nodejs')
    expect(install).not.toHaveBeenCalled()
    expect(plain.data.suggestions[0]).toContain('install')
  })

  it('should keep the files and say how to install when install fails', async () => {
    vi.mocked(install).mockRejectedValueOnce(new Error('npm install exited with 1'))
    const output = await run(false, '--template', 'nodejs', '--install')
    expect(output.error.code).toBe('INSTALL_FAILED')
    expect(output.error.suggestions[0]).toMatch(/install$/)
  })

  it('should fail with the list without a terminal', async () => {
    const output = await run(false)
    expect(select).not.toHaveBeenCalled()
    expect(output.error.code).toBe('TEMPLATE_REQUIRED')
  })
})
