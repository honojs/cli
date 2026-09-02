import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CliError } from '../../utils/output.js'
import { classifyPositionals } from './positionals.js'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

const getExistsSync = async () => vi.mocked((await import('node:fs')).existsSync)

describe('classifyPositionals', () => {
  let existsSync: Awaited<ReturnType<typeof getExistsSync>>

  beforeEach(async () => {
    existsSync = await getExistsSync()
    existsSync.mockReturnValue(false)
  })

  it('classifies curl-style method and path', () => {
    expect(classifyPositionals(['GET', '/api/orders'])).toEqual({
      method: 'GET',
      path: '/api/orders',
    })
  })

  it('classifies a bare path', () => {
    expect(classifyPositionals(['/api/orders'])).toEqual({ path: '/api/orders' })
  })

  it('keeps an existing file as the app file', () => {
    existsSync.mockReturnValue(true)
    expect(classifyPositionals(['src/app.ts'])).toEqual({ file: 'src/app.ts' })
  })

  it('an existing file wins over a method name', () => {
    existsSync.mockReturnValue(true)
    expect(classifyPositionals(['GET'])).toEqual({ file: 'GET' })
  })

  it('keeps - as the stdin file', () => {
    expect(classifyPositionals(['-'])).toEqual({ file: '-' })
  })

  it('classifies file, method, and path together', () => {
    existsSync.mockImplementation((p) => String(p).endsWith('app.ts'))
    expect(classifyPositionals(['src/app.ts', 'POST', '/api/orders'])).toEqual({
      file: 'src/app.ts',
      method: 'POST',
      path: '/api/orders',
    })
  })

  it('treats a missing non-path argument as the app file', () => {
    expect(classifyPositionals(['missing.ts'])).toEqual({ file: 'missing.ts' })
  })

  it('throws INVALID_ARGUMENTS on two paths', () => {
    expect(() => classifyPositionals(['/a', '/b'])).toThrowError(CliError)
    try {
      classifyPositionals(['/a', '/b'])
    } catch (e) {
      expect(e).toBeInstanceOf(CliError)
      if (e instanceof CliError) {
        expect(e.code).toBe('INVALID_ARGUMENTS')
      }
    }
  })
})
