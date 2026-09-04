import { CliError } from '../../utils/output.js'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

export interface Positionals {
  path?: string
  file?: string
}

/**
 * The first argument of `request` is the request path, like the URL
 * in curl. The second is the app file. A wrong shape is not
 * interpreted — it returns the exact corrected command.
 */
export const resolvePositionals = (
  pathArg: string | undefined,
  fileArg: string | undefined,
  batch: boolean
): Positionals => {
  if (batch) {
    // Batch steps carry their own paths, so the only argument is the
    // app file.
    if (pathArg !== undefined && fileArg !== undefined) {
      throw new CliError('INVALID_ARGUMENTS', 'Pass one app file with --batch', {
        suggestions: ['hono request --batch - src/app.ts'],
      })
    }
    if (pathArg?.startsWith('/')) {
      throw new CliError('INVALID_ARGUMENTS', 'Batch steps carry their own paths', {
        suggestions: ['Put the path in the batch lines'],
      })
    }
    return { file: pathArg }
  }

  if (pathArg === undefined) {
    throw new CliError('INVALID_ARGUMENTS', 'The request path is required', {
      suggestions: ['Request the root: hono request /'],
    })
  }

  if (!pathArg.startsWith('/')) {
    if (HTTP_METHODS.includes(pathArg)) {
      const path = fileArg?.startsWith('/') ? fileArg : '<path>'
      throw new CliError('INVALID_ARGUMENTS', 'The method goes in -X, like curl', {
        suggestions: [`hono request ${path} -X ${pathArg}`],
      })
    }
    throw new CliError(
      'INVALID_ARGUMENTS',
      'The first argument is the request path, like the URL in curl',
      {
        suggestions: [
          `If ${pathArg} is the app file: hono request / ${pathArg}`,
          `If it is the path: hono request /${pathArg}`,
        ],
      }
    )
  }

  return { path: pathArg, file: fileArg }
}
