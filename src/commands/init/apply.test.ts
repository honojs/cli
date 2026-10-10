import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyTemplate, mergePackageJson } from './apply'

const dirWith = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'hono-init-'))
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), content)
  }
  return dir
}

const TEMPLATE = {
  'package.json': JSON.stringify({
    type: 'module',
    scripts: { dev: 'cf dev', build: 'cf build' },
    dependencies: { hono: '^5.0.0' },
    devDependencies: { '@hono/cli': '^1.0.0-rc.2', cf: '^1.0.0-beta.14' },
  }),
  'src/index.ts': 'export default app',
  'cloudflare.config.ts': "name: '%%PROJECT_NAME%%', compatibilityDate: '2026-10-06'",
  'AGENTS.md': '# AGENTS.md',
}

describe('applyTemplate', () => {
  it('should add the template to a directory with only package.json', () => {
    const target = dirWith({
      'package.json': JSON.stringify({ name: 'My App', devDependencies: { '@hono/cli': '1.0.0' } }),
    })
    const result = applyTemplate(dirWith(TEMPLATE), target, 'npm', '2026-10-10')

    expect(result).toEqual({
      written: ['AGENTS.md', 'cloudflare.config.ts', 'package.json', 'src/index.ts'],
      skipped: [],
    })
    expect(readFileSync(join(target, 'cloudflare.config.ts'), 'utf-8')).toBe(
      "name: 'my-app', compatibilityDate: '2026-10-10'"
    )
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('My App')
    expect(pkg.type).toBe('module')
    expect(pkg.devDependencies).toEqual({ '@hono/cli': '1.0.0', cf: '^1.0.0-beta.14' })
  })

  it('should never overwrite a file, and add no second Cloudflare config', () => {
    const target = dirWith({
      'package.json': JSON.stringify({ scripts: { dev: 'wrangler dev' } }),
      'src/index.ts': 'mine',
      'wrangler.jsonc': '{}',
    })
    const result = applyTemplate(dirWith(TEMPLATE), target, 'npm')

    expect(result.skipped).toEqual(['cloudflare.config.ts', 'src/index.ts'])
    expect(readFileSync(join(target, 'src/index.ts'), 'utf-8')).toBe('mine')
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8'))
    expect(pkg.scripts).toEqual({ dev: 'wrangler dev', build: 'cf build' })
  })
})

describe('mergePackageJson', () => {
  it('should keep the existing values, except type', () => {
    expect(
      mergePackageJson(
        { name: 'a', type: 'commonjs', dependencies: { hono: '4' } },
        { type: 'module', dependencies: { hono: '5', zod: '4' } }
      )
    ).toEqual({ name: 'a', type: 'module', dependencies: { hono: '4', zod: '4' } })
  })
})
