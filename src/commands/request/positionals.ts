import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError } from '../../utils/output.js'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

export interface Positionals {
  file?: string
  method?: string
  path?: string
}

/**
 * Agents type curl-style arguments: `request GET /api/orders` or
 * `request /api/orders`. Accept them. An existing file stays the app
 * file, `-` stays stdin, an upper-case HTTP method sets the method,
 * and a `/`-leading argument is the request path.
 */
export const classifyPositionals = (args: string[]): Positionals => {
  const result: Positionals = {}

  for (const arg of args) {
    if (arg === '-' || existsSync(resolve(process.cwd(), arg))) {
      assign(result, 'file', arg)
      continue
    }
    if (HTTP_METHODS.includes(arg)) {
      assign(result, 'method', arg)
      continue
    }
    if (arg.startsWith('/')) {
      assign(result, 'path', arg)
      continue
    }
    // Not a method, not a path: treat as the app file. A missing file
    // fails later with ENTRY_NOT_FOUND and its own suggestions.
    assign(result, 'file', arg)
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
