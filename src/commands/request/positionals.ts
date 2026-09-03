import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError } from '../../utils/output.js'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

export interface Positionals {
  file?: string
  path?: string
}

/**
 * Accept curl-style arguments: like the URL in curl, a `/`-leading
 * argument is the request path. An existing file stays the app file,
 * and `-` stays stdin. curl takes no method argument, so a
 * method-like argument gets the exact `-X` command as a suggestion.
 */
export const classifyPositionals = (args: string[]): Positionals => {
  const result: Positionals = {}
  const methods: string[] = []

  for (const arg of args) {
    if (arg === '-' || existsSync(resolve(process.cwd(), arg))) {
      assign(result, 'file', arg)
      continue
    }
    if (HTTP_METHODS.includes(arg)) {
      methods.push(arg)
      continue
    }
    if (arg.startsWith('/')) {
      assign(result, 'path', arg)
      continue
    }
    // Not a path: treat as the app file. A missing file fails later
    // with ENTRY_NOT_FOUND and its own suggestions.
    assign(result, 'file', arg)
  }

  if (methods.length > 0) {
    throw new CliError('INVALID_ARGUMENTS', 'The method is not an argument, like in curl', {
      suggestions: [`Pass it with -X: hono request -X ${methods[0]} -P ${result.path ?? '<path>'}`],
    })
  }

  return result
}

const assign = (result: Positionals, key: keyof Positionals, value: string): void => {
  if (result[key] !== undefined && result[key] !== value) {
    throw new CliError(
      'INVALID_ARGUMENTS',
      `Two values for the ${key}: ${result[key]} and ${value}`,
      {
        suggestions: ['Request a path like: hono request -P /api/orders'],
      }
    )
  }
  result[key] = value
}
