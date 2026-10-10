import { afterEach, describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultRuntime, resolveRuntime } from './runtime-option'

const projectWith = (...files: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'hono-cli-runtime-'))
  for (const file of files) {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), '')
  }
  process.chdir(dir)
}

describe('defaultRuntime', () => {
  const cwd = process.cwd()
  afterEach(() => {
    process.chdir(cwd)
  })

  it('is vite in a cf project', () => {
    projectWith('cloudflare.config.ts', 'vite.config.ts')
    expect(defaultRuntime(undefined, true)).toBe('vite')
    expect(resolveRuntime(undefined, undefined)).toBe('vite')
  })

  it('is node with a file argument or --no-bindings', () => {
    projectWith('cloudflare.config.ts', 'vite.config.ts')
    expect(defaultRuntime('src/app.ts', true)).toBe('node')
    expect(defaultRuntime(undefined, false)).toBe('node')
  })

  it('is vite with the default entry as the file in a cf project', () => {
    projectWith('cloudflare.config.ts', 'vite.config.ts', 'src/index.tsx')
    expect(defaultRuntime('src/index.tsx', true)).toBe('vite')
    expect(defaultRuntime('./src/index.tsx', true)).toBe('vite')
    expect(resolveRuntime(undefined, 'src/index.tsx')).toBe('vite')
    expect(defaultRuntime('src/index.tsx', false)).toBe('node')
    projectWith('vite.config.ts', 'src/index.ts')
    expect(defaultRuntime('src/index.ts', true)).toBe('node')
  })

  it('is vite in a Vite project with no entry file', () => {
    projectWith('vite.config.ts')
    expect(defaultRuntime(undefined, true)).toBe('vite')
    projectWith('vite.config.ts', 'src/index.ts')
    expect(defaultRuntime(undefined, true)).toBe('node')
  })

  it('is node without a Vite config or with a wrangler config', () => {
    projectWith('cloudflare.config.ts')
    expect(defaultRuntime(undefined, true)).toBe('node')
    projectWith('cloudflare.config.ts', 'vite.config.ts', 'wrangler.jsonc', 'src/index.ts')
    expect(defaultRuntime(undefined, true)).toBe('node')
  })
})

describe('resolveRuntime', () => {
  it('accepts node, workerd, and vite', () => {
    expect(resolveRuntime('node', 'src/app.ts')).toBe('node')
    expect(resolveRuntime('workerd', undefined)).toBe('workerd')
    expect(resolveRuntime('vite', undefined)).toBe('vite')
  })

  it('rejects a file argument and --no-bindings with vite', () => {
    expect(() => resolveRuntime('vite', 'src/app.ts')).toThrowError(
      /vite runs the app from your Vite config/
    )
    expect(resolveRuntime('vite', 'src/index.ts')).toBe('vite')
    expect(() => resolveRuntime('vite', undefined, false)).toThrowError(
      /--no-bindings applies to --runtime node only/
    )
  })

  it('rejects other runtimes and points at request', () => {
    expect(() => resolveRuntime('bun', undefined)).toThrowError(/Unknown runtime: bun/)
    try {
      resolveRuntime('deno', undefined)
    } catch (e) {
      expect(e).toMatchObject({ code: 'INVALID_OPTION' })
      expect((e as { suggestions: string[] }).suggestions[1]).toContain('hono request')
    }
  })

  it('rejects --no-bindings with workerd', () => {
    expect(() => resolveRuntime('workerd', undefined, false)).toThrowError(
      /--no-bindings applies to --runtime node only/
    )
    expect(resolveRuntime('node', undefined, false)).toBe('node')
  })

  it('rejects a file argument with workerd', () => {
    expect(() => resolveRuntime('workerd', 'src/app.ts')).toThrowError(
      /workerd runs the app from your wrangler config/
    )
  })
})
