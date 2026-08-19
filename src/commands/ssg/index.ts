import type { Command } from 'commander'
import { toSSG } from 'hono/ssg'
import fs from 'node:fs/promises'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'

export const agentContext: CommandAgentContext = {
  output: '{ "output": "static", "files": ["static/index.html", "static/about.html"] }',
  errors: ['ENTRY_NOT_FOUND', 'SSG_FAILED'],
  examples: ['hono ssg', 'hono ssg -o dist/static src/app.ts'],
  notes: [
    'Only GET routes are generated. Use `ssgParams()` for dynamic routes and `disableSSG()` to skip a route.',
  ],
}

interface SsgOptions {
  outdir: string
  plain: boolean
  external?: string[]
}

export function ssgCommand(program: Command) {
  program
    .command('ssg')
    .description('Generate static files from your Hono app')
    .argument('[file]', 'Path to the Hono app file')
    .option('-o, --outdir <dir>', 'output directory', 'static')
    .option('--plain', 'human-readable output instead of JSON', false)
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .action(
      handleErrors(async (file: string | undefined, options: SsgOptions) => {
        const buildIterator = getBuildIterator(file, false, options.external || [])
        const app = (await buildIterator.next()).value

        const result = await toSSG(app, fs, { dir: options.outdir })

        if (!result.success) {
          throw new CliError(
            'SSG_FAILED',
            result.error?.message ?? 'Failed to generate static files',
            'Check the routes with: hono routes'
          )
        }

        const files = result.files ?? []

        if (options.plain) {
          for (const generated of files) {
            console.log(generated)
          }
          return
        }

        printResult({ output: options.outdir, files })
      })
    )
}
