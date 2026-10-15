import type { Command } from 'commander'
import { getRouterName, inspectRoutes } from 'hono/dev'
import { stubCloudflareModules } from '../../utils/cloudflare-stub.js'
import type { CommandHelp } from '../../utils/help.js'
import { renderCommandHelp } from '../../utils/help.js'
import { getBuildIterator, hasDefaultEntry } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { isVoidProject, loadVoidApp, startVite } from '../../utils/vite.js'

const help: CommandHelp = {
  output:
    '{ "router": "SmartRouter + RegExpRouter", "routes": [{ "method": "GET", "path": "/", "name": "[handler]", "isMiddleware": false }] }',
  examples: ['hono routes', 'hono routes --verbose src/app.ts', 'hono routes --exclude /__void'],
  notes: [
    'Routes are resolved from the real app instance, so mounted sub-apps and basePath are all expanded.',
    'Run it first to get the full picture of an app without reading the source.',
    'In a Void project (no entry file), the routes come from the app that Void builds through Vite.',
    '--exclude hides the routes whose path starts with the prefix, e.g. internal routes a framework adds.',
  ],
}

interface RoutesOptions {
  verbose: boolean
  plain: boolean
  external?: string[]
  exclude: string[]
}

export function routesCommand(program: Command) {
  program
    .command('routes')
    .addHelpText('after', renderCommandHelp(help))
    .description('Show routes of your Hono app')
    .argument('[file]', 'Path to the Hono app file')
    .option('--verbose', 'include middleware', false)
    .option('--plain', 'human-readable output instead of JSON', false)
    .option(
      '--exclude <prefix>',
      'hide routes whose path starts with the prefix (can be used multiple times)',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[]
    )
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .action(
      handleErrors(async (file: string | undefined, options: RoutesOptions) => {
        const app =
          file === undefined && !hasDefaultEntry() && isVoidProject()
            ? await readVoidApp()
            : // Reading routes runs no handler, so cloudflare:* can be a stub
              (
                await getBuildIterator(file, false, options.external || [], [
                  stubCloudflareModules,
                ]).next()
              ).value

        if (!app || !Array.isArray(app.routes)) {
          throw new CliError('INVALID_APP', 'The app does not expose routes', {
            suggestions: ['Export the Hono instance as the default export'],
            docs: 'https://hono.dev/docs/api/hono',
          })
        }

        const routes = inspectRoutes(app).filter(
          ({ isMiddleware, path }) =>
            (options.verbose || !isMiddleware) &&
            !options.exclude.some((prefix) => path.startsWith(prefix))
        )
        const router = getRouterName(app)

        if (options.plain) {
          const maxMethodLength = Math.max(...routes.map(({ method }) => method.length), 0)
          for (const route of routes) {
            console.log(`${route.method.padEnd(maxMethodLength)} ${route.path}`)
          }
          return
        }

        printResult({ router, routes })
      })
    )
}

/** A Void app has no entry file: Vite builds it from the file-based routes */
const readVoidApp = async () => {
  const target = await startVite()
  try {
    return await loadVoidApp(target)
  } finally {
    await target.dispose().catch(() => {})
  }
}
