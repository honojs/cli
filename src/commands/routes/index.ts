import type { Command } from 'commander'
import { getRouterName, inspectRoutes } from 'hono/dev'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'

export const agentContext: CommandAgentContext = {
  output:
    '{ "router": "SmartRouter + RegExpRouter", "routes": [{ "method": "GET", "path": "/", "name": "[handler]", "isMiddleware": false }] }',
  errors: ['ENTRY_NOT_FOUND', 'BUILD_FAILED', 'INVALID_APP'],
  examples: ['hono routes', 'hono routes --verbose src/app.ts'],
  notes: [
    'Routes are resolved from the real app instance, so mounted sub-apps and basePath are all expanded.',
    'Run it first to get the full picture of an app without reading the source.',
  ],
}

interface RoutesOptions {
  verbose: boolean
  plain: boolean
  external?: string[]
}

export function routesCommand(program: Command) {
  program
    .command('routes')
    .description('Show routes of your Hono app')
    .argument('[file]', 'Path to the Hono app file')
    .option('--verbose', 'include middleware', false)
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
      handleErrors(async (file: string | undefined, options: RoutesOptions) => {
        const buildIterator = getBuildIterator(file, false, options.external || [])
        const app = (await buildIterator.next()).value

        if (!app || !Array.isArray(app.routes)) {
          throw new CliError('INVALID_APP', 'The app does not expose routes', {
            suggestions: ['Export the Hono instance as the default export'],
            docs: 'https://hono.dev/docs/api/hono',
          })
        }

        const routes = inspectRoutes(app).filter(
          ({ isMiddleware }) => options.verbose || !isMiddleware
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
