import { CliError } from './output.js'

export type BatchRuntime = 'node' | 'workerd'

/**
 * `--runtime` for the commands that run many requests: `node` (the
 * default) or `workerd`. workerd starts the app from the wrangler
 * config, so a file argument is an error there, and so is
 * `--no-bindings`: the proxy is a Node.js thing, workerd has the real
 * bindings.
 */
export const resolveRuntime = (
  runtime: string,
  file: string | undefined,
  bindings = true
): BatchRuntime => {
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
  if (runtime === 'workerd' && !bindings) {
    throw new CliError('INVALID_OPTION', '--no-bindings applies to --runtime node only', {
      suggestions: [
        'Drop --no-bindings: another runtime never loads the bindings proxy, and workerd has the real bindings from the wrangler config',
        'Or drop --runtime to run on Node.js without the bindings',
      ],
    })
  }
  return runtime
}
