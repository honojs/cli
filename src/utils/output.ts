interface CliErrorOptions {
  suggestions?: string[]
  docs?: string
}

export class CliError extends Error {
  code: string
  suggestions?: string[]
  docs?: string

  constructor(code: string, message: string, options: CliErrorOptions = {}) {
    super(message)
    this.code = code
    this.suggestions = options.suggestions
    this.docs = options.docs
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
        ...(error.suggestions?.length ? { suggestions: error.suggestions } : {}),
        ...(error.docs ? { docs: error.docs } : {}),
      },
    },
    null,
    2
  )

/**
 * Turn a commander parse error (unknown option, bad argument) into the
 * JSON envelope, so argument mistakes get the same contract as command
 * errors.
 */
// Agents invent flags. Map the common wrong guesses to the real one.
const FLAG_FIXES: Record<string, string> = {
  '-P': 'The path is the first argument: hono request /api/users',
  '--path': 'The path is the first argument: hono request /api/users',
  '--body': `The body flag is -d: hono request /api/users -X POST -d '{"name":"Alice"}'`,
  '-j': `The body flag is -d: hono request /api/users -X POST -d '{"name":"Alice"}'`,
  '-m': 'The method flag is -X: hono request /api/users -X POST',
}

export const formatArgumentsError = (message: string): string => {
  const cleaned = message.replace(/^error: /, '').trim()
  const flag = cleaned.match(/unknown option '([^']+)'/)?.[1]
  const fix = flag ? FLAG_FIXES[flag] : undefined
  const suggestions = [fix ?? 'Check the usage: hono <command> --help']
  return formatError(new CliError('INVALID_ARGUMENTS', cleaned, { suggestions }))
}

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
