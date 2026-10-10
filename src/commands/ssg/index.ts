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
import { trackSkipped } from './skipped.js'

const help: CommandHelp = {
  output:
    '{ "output": "static", "files": ["static/index.html"], "skipped": [{ "path": "/counter", "status": 500 }] }',
  examples: ['hono ssg', 'hono ssg -o dist/static src/app.ts', "hono ssg --exclude '/api/*'"],
  notes: [
    '`--include` / `--exclude` select routes by path. `*` matches anything.',
    'In a project with a wrangler config, c.env carries the real local bindings automatically. Skip it with --no-bindings.',
    'A page that does not answer 200 is not written. It is listed in "skipped" with its status — check it with hono request <path>.',
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
        const tracked = trackSkipped(proxy ? withBindings(app, proxy.env) : app)
        let result: Awaited<ReturnType<typeof toSSG>>
        try {
          result = await toSSG(tracked.app, fs, {
            dir: options.outdir,
            beforeRequestHook: (req) => (filter(new URL(req.url).pathname) ? req : false),
            afterResponseHook: tracked.afterResponseHook,
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

        const skipped = tracked.skipped.sort((a, b) => a.path.localeCompare(b.path))

        if (options.plain) {
          for (const generated of files) {
            console.log(generated)
          }
          for (const page of skipped) {
            console.error(`skipped ${page.path} (${page.status})`)
          }
          return
        }

        printResult({ output: options.outdir, files, ...(skipped.length ? { skipped } : {}) })
      })
    )
}
