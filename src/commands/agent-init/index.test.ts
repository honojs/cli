import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../init/install.js', () => ({ runPackageManager: vi.fn(async () => {}) }))

import { runPackageManager } from '../init/install.js'
import { agentInitCommand } from './index.js'

describe('agentInitCommand', () => {
  const cwd = process.cwd()
  let log: ReturnType<typeof vi.spyOn>

  const run = async (...args: string[]) => {
    const program = new Command().version('1.0.0')
    agentInitCommand(program)
    await program.parseAsync(['node', 'test', 'agent-init', ...args])
    return JSON.parse(log.mock.calls[0][0] as string)
  }

  const packageJson = (pkg: object) => writeFileSync('package.json', JSON.stringify(pkg))

  beforeEach(() => {
    process.chdir(mkdtempSync(join(tmpdir(), 'hono-agent-init-')))
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('npm_config_user_agent', '')
  })

  afterEach(() => {
    process.chdir(cwd)
    process.exitCode = undefined
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('should detect a Void app and add @hono/cli with the lockfile package manager', async () => {
    packageJson({ dependencies: { void: '^0.28.0' } })
    writeFileSync('pnpm-lock.yaml', '')
    writeFileSync('wrangler.jsonc', '{}')
    const output = await run()
    expect(output.data).toEqual({
      framework: 'void',
      file: 'AGENTS.md',
      action: 'created',
      added: '@hono/cli@^1.0.0',
    })
    expect(runPackageManager).toHaveBeenCalledWith(
      'pnpm',
      ['add', '-D', '@hono/cli@^1.0.0'],
      process.cwd()
    )
    expect(readFileSync('AGENTS.md', 'utf-8')).toContain('npx skills add honojs/skills')
  })

  it('should detect a Cloudflare Workers app', async () => {
    packageJson({})
    writeFileSync('wrangler.jsonc', '{}')
    expect((await run()).data.framework).toBe('cloudflare-workers')
  })

  it('should not add @hono/cli when it is there', async () => {
    packageJson({ devDependencies: { '@hono/cli': '^1.0.0' } })
    const output = await run()
    expect(output.data.framework).toBe('hono')
    expect(output.data.added).toBeUndefined()
    expect(runPackageManager).not.toHaveBeenCalled()
  })

  it('should skip adding with --no-install and say how to add it', async () => {
    packageJson({})
    const output = await run('--no-install')
    expect(runPackageManager).not.toHaveBeenCalled()
    expect(output.data.suggestions).toEqual(['Add Hono CLI: npm add -D @hono/cli@^1.0.0'])
  })

  it('should keep the file and say how to add when adding fails', async () => {
    packageJson({})
    vi.mocked(runPackageManager).mockRejectedValueOnce(new Error('exited with 1'))
    const output = await run()
    expect(output.error.code).toBe('INSTALL_FAILED')
    expect(output.error.suggestions).toEqual(['Run it yourself: npm add -D @hono/cli@^1.0.0'])
    expect(readFileSync('AGENTS.md', 'utf-8')).toContain('## Hono CLI')
  })
})
