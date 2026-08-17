export class CliError extends Error {
  code: string
  hint?: string

  constructor(code: string, message: string, hint?: string) {
    super(message)
    this.code = code
    this.hint = hint
  }
}

export const formatResult = (data: unknown): string => JSON.stringify({ ok: true, data }, null, 2)

export const formatError = (error: CliError): string =>
  JSON.stringify(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.hint ? { hint: error.hint } : {}),
      },
    },
    null,
    2
  )

export const printResult = (data: unknown): void => {
  console.log(formatResult(data))
}

/**
 * Wrap a command action. A thrown `CliError` (or any other error)
 * becomes a JSON error on stdout with exit code 1.
 */
export const handleErrors =
  <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
  async (...args: A): Promise<void> => {
    try {
      await fn(...args)
    } catch (e) {
      const error =
        e instanceof CliError
          ? e
          : new CliError('UNEXPECTED_ERROR', e instanceof Error ? e.message : String(e))
      console.log(formatError(error))
      process.exitCode = 1
    }
  }
