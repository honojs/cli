import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { maybeLoadBindings } from './bindings.js'

describe('maybeLoadBindings', () => {
  const cwd = process.cwd()
  afterEach(() => {
    process.chdir(cwd)
  })

  it('is a no-op without a wrangler config', async () => {
    process.chdir(mkdtempSync(join(tmpdir(), 'hono-cli-bindings-')))
    expect(await maybeLoadBindings()).toBeUndefined()
  })

  it('warns and continues when wrangler is not installed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hono-cli-bindings-'))
    writeFileSync(join(dir, 'wrangler.jsonc'), '{"name":"probe"}')
    writeFileSync(join(dir, 'package.json'), '{"name":"probe"}')
    process.chdir(dir)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeLoadBindings()).toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('wrangler is not installed'))
    errorSpy.mockRestore()
  })
})
