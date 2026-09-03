import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CliError } from '../../utils/output.js'
import { classifyPositionals } from './positionals.js'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

const getExistsSync = async () => vi.mocked((await import('node:fs')).existsSync)

const expectCliError = (fn: () => unknown, code: string): CliError => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(CliError)
    if (e instanceof CliError) {
      expect(e.code).toBe(code)
      return e
    }
  }
  expect.unreachable()
}

describe('classifyPositionals', () => {
  let existsSync: Awaited<ReturnType<typeof getExistsSync>>

  beforeEach(async () => {
    existsSync = await getExistsSync()
    existsSync.mockReturnValue(false)
  })

  it('classifies a /-leading argument as the request path, like the URL in curl', () => {
    expect(classifyPositionals(['/api/orders'])).toEqual({ path: '/api/orders' })
  })

  it('keeps an existing file as the app file', () => {
    existsSync.mockReturnValue(true)
    expect(classifyPositionals(['src/app.ts'])).toEqual({ file: 'src/app.ts' })
  })

  it('classifies file and path together', () => {
    existsSync.mockImplementation((p) => String(p).endsWith('app.ts'))
    expect(classifyPositionals(['src/app.ts', '/api/orders'])).toEqual({
      file: 'src/app.ts',
      path: '/api/orders',
    })
  })

  it('keeps - as the stdin file', () => {
    expect(classifyPositionals(['-'])).toEqual({ file: '-' })
  })

  it('treats a missing non-path argument as the app file', () => {
    expect(classifyPositionals(['missing.ts'])).toEqual({ file: 'missing.ts' })
  })

  it('suggests -X for a method-like argument, with the given path', () => {
    const error = expectCliError(
      () => classifyPositionals(['GET', '/api/orders']),
      'INVALID_ARGUMENTS'
    )
    expect(error.suggestions).toEqual(['Pass it with -X: hono request -X GET -P /api/orders'])
  })

  it('suggests -X for a method-like argument without a path', () => {
    const error = expectCliError(() => classifyPositionals(['POST']), 'INVALID_ARGUMENTS')
    expect(error.suggestions).toEqual(['Pass it with -X: hono request -X POST -P <path>'])
  })

  it('an existing file named like a method stays the app file', () => {
    existsSync.mockReturnValue(true)
    expect(classifyPositionals(['GET'])).toEqual({ file: 'GET' })
  })

  it('throws INVALID_ARGUMENTS on two paths', () => {
    expectCliError(() => classifyPositionals(['/a', '/b']), 'INVALID_ARGUMENTS')
  })
})
