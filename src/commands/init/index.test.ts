import { downloadTemplate } from '@bluwy/giget-core'
import select from '@inquirer/select'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@bluwy/giget-core', () => ({ downloadTemplate: vi.fn(async () => {}) }))
vi.mock('@inquirer/select', () => ({ default: vi.fn(async () => 'nodejs') }))

import { initCommand } from './index.js'

describe('initCommand', () => {
  const cwd = process.cwd()
  const isTTY = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY }
  let log: ReturnType<typeof vi.spyOn>

  const run = async (tty: boolean) => {
    process.stdin.isTTY = tty
    process.stdout.isTTY = tty
    const program = new Command()
    initCommand(program)
    await program.parseAsync(['node', 'test', 'init'])
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

  it('should fail with the list without a terminal', async () => {
    const output = await run(false)
    expect(select).not.toHaveBeenCalled()
    expect(output.error.code).toBe('TEMPLATE_REQUIRED')
  })
})
