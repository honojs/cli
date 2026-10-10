import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectPackageManager, detectTemplate } from './detect'

const dirWith = (...files: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'hono-init-'))
  for (const file of files) {
    writeFileSync(join(dir, file), '')
  }
  return dir
}

describe('detectTemplate', () => {
  it('should pick the template from the files in the directory', () => {
    expect(detectTemplate(dirWith('wrangler.jsonc'))).toEqual({
      template: 'cloudflare-workers',
      from: 'wrangler.jsonc',
    })
    expect(detectTemplate(dirWith('cloudflare.config.ts'))?.template).toBe('cloudflare-workers')
    expect(detectTemplate(dirWith('deno.json'))?.template).toBe('deno')
    expect(detectTemplate(dirWith('bun.lock'))?.template).toBe('bun')
  })

  it('should return undefined without a hint', () => {
    expect(detectTemplate(dirWith('package.json'))).toBeUndefined()
  })
})

describe('detectPackageManager', () => {
  it('should read the lockfile', () => {
    expect(detectPackageManager(dirWith('pnpm-lock.yaml'))).toBe('pnpm')
    expect(detectPackageManager(dirWith('package-lock.json'))).toBe('npm')
  })
})
