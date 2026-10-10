import type { Command } from 'commander'
import { toSSG } from 'hono/ssg'
import fs from 'node:fs/promises'
import { maybeLoadBindings } from '../../utils/bindings.js'
import type { CommandHelp } from '../../utils/help.js'
import { renderCommandHelp } from '../../utils/help.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { withBindings } from './env.js'
import { createRouteFilter } from './route-filter.js'

const help: CommandHelp = {
  output: '{ "output": "static", "files": ["static/index.html", "static/about.html"] }',
  examples: ['hono ssg', 'hono ssg -o dist/static src/app.ts', "hono ssg --exclude '/api/*'"],
  notes: [
    '`--include` / `--exclude` select routes by path. `*` matches anything.',
    'In a project with a wrangler config, c.env carries the real local bindings automatically. Skip it with --no-bindings.',
  ],
}

interface SsgOptions {
  outdir: string
  plain: boolean
  include: string[]
  exclude: string[]
  bindings: boolean
  external?: string[]
}

const collect = (value: string, previous: string[]): string[] =>
  previous ? [...previous, value] : [value]

export function ssgCommand(program: Command) {
  program
    .command('ssg')
    .addHelpText('after', renderCommandHelp(help))
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
    .option('--no-bindings', 'Skip loading the local Cloudflare bindings')
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
        const proxy = options.bindings ? await maybeLoadBindings() : undefined
        let result: Awaited<ReturnType<typeof toSSG>>
        try {
          result = await toSSG(proxy ? withBindings(app, proxy.env) : app, fs, {
            dir: options.outdir,
            beforeRequestHook: (req) => (filter(new URL(req.url).pathname) ? req : false),
          })
        } finally {
          await proxy?.dispose()
        }

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
