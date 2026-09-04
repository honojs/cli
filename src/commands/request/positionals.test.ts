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
    expect(resolvePositionals('/api/users', 'src/app.ts', false)).toEqual({
      path: '/api/users',
      file: 'src/app.ts',
    })
  })

  it('takes the path alone', () => {
    expect(resolvePositionals('/', undefined, false)).toEqual({ path: '/', file: undefined })
  })

  it('takes - as the stdin app file', () => {
    expect(resolvePositionals('/hello', '-', false)).toEqual({ path: '/hello', file: '-' })
  })

  it('requires the path', () => {
    expect(expectSuggestions(() => resolvePositionals(undefined, undefined, false))).toEqual([
      'Request the root: hono request /',
    ])
  })

  it('corrects a curl-style method argument with the exact command', () => {
    expect(expectSuggestions(() => resolvePositionals('GET', '/api/orders', false))).toEqual([
      'hono request /api/orders -X GET',
    ])
  })

  it('corrects a method argument without a path', () => {
    expect(expectSuggestions(() => resolvePositionals('POST', undefined, false))).toEqual([
      'hono request <path> -X POST',
    ])
  })

  it('corrects a file-first call with both readings', () => {
    expect(expectSuggestions(() => resolvePositionals('src/app.ts', undefined, false))).toEqual([
      'If src/app.ts is the app file: hono request / src/app.ts',
      'If it is the path: hono request /src/app.ts',
    ])
  })

  it('takes the single batch argument as the app file', () => {
    expect(resolvePositionals('src/app.ts', undefined, true)).toEqual({ file: 'src/app.ts' })
  })

  it('rejects a path argument with --batch', () => {
    expect(expectSuggestions(() => resolvePositionals('/api/users', undefined, true))).toEqual([
      'Put the path in the batch lines',
    ])
  })
})
