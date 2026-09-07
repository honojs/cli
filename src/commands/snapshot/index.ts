import type { Command } from 'commander'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { handleErrors } from '../../utils/output.js'
import { snapshotLines } from './snapshot.js'

export const agentContext: CommandAgentContext = {
  output:
    '{"path":"/users","expect":{"status":200,"body":[{"id":1}]}} — one batch JSONL line per route, not the JSON envelope',
  errors: ['ENTRY_NOT_FOUND', 'BUILD_FAILED', 'INVALID_APP'],
  examples: ['hono snapshot', 'hono snapshot src/app.ts'],
  notes: [
    'Prints the current behavior of the app as batch JSONL lines, to stdout. No file is written — keep the lines in your context, or redirect if you want one.',
    'Paramless GET routes are executed and their actual status and body become the "expect". Param and non-GET routes are printed without one, for you to fill in — the tool does not invent intent.',
    'One probe line records the current response for a path that matches no route.',
    'Capture before a refactor, then rerun the lines with hono batch until "failed" is 0.',
    'Unlike routes, this command sends real requests to the app — middleware runs.',
  ],
}

interface SnapshotOptions {
  external?: string[]
}

export function snapshotCommand(program: Command) {
  program
    .command('snapshot')
    .description('Print the current behavior as batch JSONL lines')
    .argument('[file]', 'Path to the Hono app file')
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
        for await (const app of getBuildIterator(file, false, options.external || [])) {
          console.log((await snapshotLines(app)).join('\n'))
        }
      })
    )
}
