import { CliError } from './output.js'

export type BatchRuntime = 'node' | 'workerd'

/**
 * `--runtime` for the commands that run many requests: `node` (the
 * default) or `workerd`. workerd starts the app from the wrangler
 * config, so a file argument is an error there.
 */
export const resolveRuntime = (runtime: string, file: string | undefined): BatchRuntime => {
  if (runtime !== 'node' && runtime !== 'workerd') {
    throw new CliError('INVALID_OPTION', `Unknown runtime: ${runtime}`, {
      suggestions: [
        'Use node or workerd',
        'For a single request on bun or deno: hono request <path> --runtime bun',
      ],
    })
  }
  if (runtime === 'workerd' && file !== undefined) {
    throw new CliError('INVALID_OPTION', 'workerd runs the app from your wrangler config', {
      suggestions: ['Drop the file argument. The entry is `main` in the wrangler config'],
    })
  }
  return runtime
}
