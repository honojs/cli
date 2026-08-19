import type { Command } from 'commander'
import { toSSG } from 'hono/ssg'
import fs from 'node:fs/promises'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { createRouteFilter } from './route-filter.js'

export const agentContext: CommandAgentContext = {
  output: '{ "output": "static", "files": ["static/index.html", "static/about.html"] }',
  errors: ['ENTRY_NOT_FOUND', 'SSG_FAILED'],
  examples: ['hono ssg', 'hono ssg -o dist/static src/app.ts', "hono ssg --exclude '/api/*'"],
  notes: ['`--include` / `--exclude` select routes by path. `*` matches anything.'],
}

interface SsgOptions {
  outdir: string
  plain: boolean
  include: string[]
  exclude: string[]
  external?: string[]
}

const collect = (value: string, previous: string[]): string[] =>
  previous ? [...previous, value] : [value]

export function ssgCommand(program: Command) {
  program
    .command('ssg')
    .description('Generate static files from your Hono app')
    .argument('[file]', 'Path to the Hono app file')
    .option('-o, --outdir <dir>', 'output directory', 'static')
    .option('--plain', 'human-readable output instead of JSON', false)
    .option(
      '--include <path>',
      'generate only matching paths, `*` matches anything (can be used multiple times)',
      collect,
      [] as string[]
    )
    .option(
      '--exclude <path>',
      'skip matching paths, `*` matches anything (can be used multiple times)',
      collect,
      [] as string[]
    )
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      collect,
      [] as string[]
    )
    .action(
      handleErrors(async (file: string | undefined, options: SsgOptions) => {
        const buildIterator = getBuildIterator(file, false, options.external || [])
        const app = (await buildIterator.next()).value

        const filter = createRouteFilter(options.include, options.exclude)
        const result = await toSSG(app, fs, {
          dir: options.outdir,
          beforeRequestHook: (req) => (filter(new URL(req.url).pathname) ? req : false),
        })

        if (!result.success) {
          throw new CliError(
            'SSG_FAILED',
            result.error?.message ?? 'Failed to generate static files',
            {
              suggestions: ['Check the routes with: hono routes'],
              docs: 'https://hono.dev/docs/helpers/ssg',
            }
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
