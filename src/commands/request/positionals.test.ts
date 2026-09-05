import { describe, it, expect } from 'vitest'
import { CliError } from '../../utils/output.js'
import { resolvePositionals } from './positionals.js'

const expectSuggestions = (fn: () => unknown): string[] => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(CliError)
    if (e instanceof CliError) {
      expect(e.code).toBe('INVALID_ARGUMENTS')
      return e.suggestions ?? []
    }
  }
  expect.unreachable()
}

describe('resolvePositionals', () => {
  it('takes the path first and the file second', () => {
    expect(resolvePositionals('/api/users', 'src/app.ts')).toEqual({
      path: '/api/users',
      file: 'src/app.ts',
    })
  })

  it('takes the path alone', () => {
    expect(resolvePositionals('/', undefined)).toEqual({ path: '/', file: undefined })
  })

  it('takes - as the stdin app file', () => {
    expect(resolvePositionals('/hello', '-')).toEqual({ path: '/hello', file: '-' })
  })

  it('requires the path', () => {
    expect(expectSuggestions(() => resolvePositionals(undefined, undefined))).toEqual([
      'Request the root: hono request /',
    ])
  })

  it('corrects a curl-style method argument with the exact command', () => {
    expect(expectSuggestions(() => resolvePositionals('GET', '/api/orders'))).toEqual([
      'hono request /api/orders -X GET',
    ])
  })

  it('corrects a method argument without a path', () => {
    expect(expectSuggestions(() => resolvePositionals('POST', undefined))).toEqual([
      'hono request <path> -X POST',
    ])
  })

  it('corrects a file-first call with both readings', () => {
    expect(expectSuggestions(() => resolvePositionals('src/app.ts', undefined))).toEqual([
      'If src/app.ts is the app file: hono request / src/app.ts',
      'If it is the path: hono request /src/app.ts',
    ])
  })
})
