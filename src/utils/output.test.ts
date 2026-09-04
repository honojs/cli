import { describe, it, expect, vi, afterEach } from 'vitest'
import { CliError, formatArgumentsError, formatResult, formatError, handleErrors } from './output'

describe('formatResult', () => {
  it('should wrap data in the envelope', () => {
    const parsed = JSON.parse(formatResult({ router: 'TrieRouter' }))
    expect(parsed).toEqual({ ok: true, data: { router: 'TrieRouter' } })
  })
})

describe('formatError', () => {
  it('should include code, message, suggestions, and docs', () => {
    const error = new CliError('ENTRY_NOT_FOUND', 'src/index.ts does not exist', {
      suggestions: ['Pass a file', 'Check the candidates'],
      docs: 'https://hono.dev/docs',
    })
    expect(JSON.parse(formatError(error))).toEqual({
      ok: false,
      error: {
        code: 'ENTRY_NOT_FOUND',
        message: 'src/index.ts does not exist',
        suggestions: ['Pass a file', 'Check the candidates'],
        docs: 'https://hono.dev/docs',
      },
    })
  })

  it('should omit suggestions and docs when not set', () => {
    const error = new CliError('UNEXPECTED_ERROR', 'boom')
    expect(JSON.parse(formatError(error))).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'boom' },
    })
  })
})

describe('formatArgumentsError', () => {
  it('should turn a commander message into the envelope', () => {
    expect(JSON.parse(formatArgumentsError("error: unknown option '--app'"))).toEqual({
      ok: false,
      error: {
        code: 'INVALID_ARGUMENTS',
        message: "unknown option '--app'",
        suggestions: ['Check the usage: hono <command> --help'],
      },
    })
  })
})

describe('formatArgumentsError flag fixes', () => {
  it('should point old -P calls at the positional path', () => {
    const parsed = JSON.parse(formatArgumentsError("error: unknown option '-P'"))
    expect(parsed.error.suggestions).toEqual([
      'The path is the first argument: hono request /api/users',
    ])
  })

  it('should map an invented flag to the real one', () => {
    const body = JSON.parse(formatArgumentsError("error: unknown option '--body'"))
    expect(body.error.suggestions[0]).toContain('-d')
    const method = JSON.parse(formatArgumentsError("error: unknown option '-m'"))
    expect(method.error.suggestions[0]).toContain('-X')
  })
})

describe('handleErrors', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('should print a thrown CliError as JSON and set exit code 1', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handleErrors(async () => {
      throw new CliError('ENTRY_NOT_FOUND', 'not found')
    })()
    expect(JSON.parse(log.mock.calls[0][0]).error.code).toBe('ENTRY_NOT_FOUND')
    expect(process.exitCode).toBe(1)
  })

  it('should convert an unknown error to UNEXPECTED_ERROR', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handleErrors(async () => {
      throw new Error('boom')
    })()
    const parsed = JSON.parse(log.mock.calls[0][0])
    expect(parsed.error).toEqual({ code: 'UNEXPECTED_ERROR', message: 'boom' })
    expect(process.exitCode).toBe(1)
  })

  it('should do nothing on success', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handleErrors(async () => {})()
    expect(log).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })
})
