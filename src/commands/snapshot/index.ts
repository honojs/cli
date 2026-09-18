import type { Command } from 'commander'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { maybeLoadBindings } from '../../utils/bindings.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { handleErrors } from '../../utils/output.js'
import { resolveRuntime } from '../../utils/runtime-option.js'
import { readWorkerdMain, startWorkerd } from '../../utils/workerd.js'
import { snapshotLines } from './snapshot.js'

export const agentContext: CommandAgentContext = {
  output:
    '{"path":"/users","expect":{"status":200,"body":[{"id":1}]}} — one batch JSONL line per route, not the JSON envelope',
  errors: [
    'ENTRY_NOT_FOUND',
    'BUILD_FAILED',
    'INVALID_APP',
    'BINDINGS_FAILED',
    'WRANGLER_NOT_FOUND',
    'WRANGLER_CONFIG_NOT_FOUND',
    'RUNTIME_FAILED',
  ],
  examples: ['hono snapshot', 'hono snapshot src/app.ts'],
  notes: [
    'Prints the current behavior of the app as batch JSONL lines, to stdout. No file is written — keep the lines in your context, or redirect if you want one.',
    'Paramless GET routes are executed and their actual status and body become the "expect". Param and non-GET routes are printed without one, for you to fill in — the tool does not invent intent.',
    'One probe line records the current response for a path that matches no route.',
    'Capture before a refactor, then rerun the lines with hono batch until "failed" is 0.',
    '--status-only captures only the status codes — much smaller on a large app. The probe line keeps its body either way: a dropped notFound handler still answers 404, only the body changes.',
    'Unlike routes, this command sends real requests to the app — middleware runs.',
    'In a project with a wrangler config, c.env carries the real local bindings automatically. Skip it with --no-bindings.',
    '--runtime workerd sends the requests to the app running inside workerd. The routes are read from main in the wrangler config, so pass no file argument.',
  ],
}

interface SnapshotOptions {
  external?: string[]
  statusOnly: boolean
  bindings: boolean
  runtime: string
}

export function snapshotCommand(program: Command) {
  program
    .command('snapshot')
    .description('Print the current behavior as batch JSONL lines')
    .argument('[file]', 'Path to the Hono app file')
    .option('--status-only', 'Capture only the status codes, not the bodies', false)
    .option('--runtime <runtime>', 'runtime to execute the app (node | workerd)', 'node')
    .option('--no-bindings', 'Skip loading the local Cloudflare bindings')
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .action(
      handleErrors(async (file: string | undefined, options: SnapshotOptions) => {
        const external = options.external || []
        if (resolveRuntime(options.runtime, file, options.bindings) === 'workerd') {
          // The routes come from the entry in-process; the requests go to workerd.
          const main = await readWorkerdMain()
          const target = await startWorkerd()
          try {
            for await (const app of getBuildIterator(main, false, external)) {
              console.log(
                (await snapshotLines(app, options.statusOnly, undefined, target)).join('\n')
              )
            }
          } finally {
            await target.dispose().catch(() => {})
          }
          return
        }

        const proxy = options.bindings ? await maybeLoadBindings() : undefined
        try {
          for await (const app of getBuildIterator(file, false, external)) {
            console.log((await snapshotLines(app, options.statusOnly, proxy?.env)).join('\n'))
          }
        } finally {
          await proxy?.dispose()
        }
      })
    )
}
