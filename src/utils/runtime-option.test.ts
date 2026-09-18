import { describe, it, expect } from 'vitest'
import { resolveRuntime } from './runtime-option'

describe('resolveRuntime', () => {
  it('accepts node and workerd', () => {
    expect(resolveRuntime('node', 'src/app.ts')).toBe('node')
    expect(resolveRuntime('workerd', undefined)).toBe('workerd')
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
