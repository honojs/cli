import { CliError } from './output.js'
import { hasViteConfig } from './vite.js'
import { findWranglerConfig, hasCloudflareConfig } from './workerd.js'

export type BatchRuntime = 'node' | 'workerd' | 'vite'

/**
 * A cf project: cloudflare.config.ts and a Vite config,
 * no wrangler config. The bindings work only through Vite there.
 */
export const isCfViteProject = (): boolean =>
  hasCloudflareConfig() && !findWranglerConfig() && hasViteConfig()

/**
 * The runtime without `--runtime`: vite in a cf project, so c.env has
 * the bindings, and node otherwise. A file argument or `--no-bindings`
 * asks for the app on Node.js.
 */
export const defaultRuntime = (file: string | undefined, bindings: boolean): 'node' | 'vite' =>
  file === undefined && bindings && isCfViteProject() ? 'vite' : 'node'

/**
 * `--runtime` for the commands that run many requests: `node`,
 * `workerd`, or `vite`. Without it, see `defaultRuntime`. workerd
 * starts the app from the wrangler config and vite from the Vite
 * config, so a file
 * argument is an error there, and so is `--no-bindings`: the proxy is
 * a Node.js thing.
 */
export const resolveRuntime = (
  runtime: string | undefined,
  file: string | undefined,
  bindings = true
): BatchRuntime => {
  runtime ??= defaultRuntime(file, bindings)
  if (runtime !== 'node' && runtime !== 'workerd' && runtime !== 'vite') {
    throw new CliError('INVALID_OPTION', `Unknown runtime: ${runtime}`, {
      suggestions: [
        'Use node, workerd, or vite',
        'For a single request on bun or deno: hono request <path> --runtime bun',
      ],
    })
  }
  if (runtime === 'workerd' && file !== undefined) {
    throw new CliError('INVALID_OPTION', 'workerd runs the app from your wrangler config', {
      suggestions: ['Drop the file argument. The entry is `main` in the wrangler config'],
    })
  }
  if (runtime === 'vite' && file !== undefined) {
    throw new CliError('INVALID_OPTION', VITE_FILE_ERROR, {
      suggestions: ['Drop the file argument'],
    })
  }
  if (runtime !== 'node' && !bindings) {
    throw new CliError('INVALID_OPTION', '--no-bindings applies to --runtime node only', {
      suggestions: [
        'Drop --no-bindings: another runtime never loads the bindings proxy, and workerd has the real bindings from the wrangler config',
        'Or drop --runtime to run on Node.js without the bindings',
      ],
    })
  }
  return runtime
}

export const VITE_FILE_ERROR = 'vite runs the app from your Vite config'
