import { describe, it, expect } from 'vitest'
import { projectHonoSource, resolveHonoSource } from './hono-source'

describe('projectHonoSource', () => {
  it('should label with the installed hono version', () => {
    const source = projectHonoSource()
    expect(source.label).toMatch(/^\d+\.\d+\.\d+/)
    expect(source.resolveDir).toBeUndefined()
  })
})

describe('resolveHonoSource', () => {
  it('should use a local package directory', async () => {
    const source = await resolveHonoSource('./node_modules/hono')
    expect(source.label).toContain('(./node_modules/hono)')
    expect(source.resolveDir).toBeDefined()
    source.cleanup?.()
  })

  it('should fail with HONO_SOURCE_NOT_FOUND for a missing path', async () => {
    await expect(resolveHonoSource('./no-such-dir')).rejects.toMatchObject({
      code: 'HONO_SOURCE_NOT_FOUND',
    })
  })

  it('should install a published version with npm', { timeout: 0 }, async () => {
    const source = await resolveHonoSource('4.9.10')
    expect(source.label).toBe('4.9.10')
    expect(source.resolveDir).toBeDefined()
    source.cleanup?.()
  })
})
