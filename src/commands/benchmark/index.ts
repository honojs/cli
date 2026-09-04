import type { Command } from 'commander'
import { inspectRoutes } from 'hono/dev'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { buildAndImportApp } from '../../utils/build.js'
import { getBuildIterator, resolveData, resolveEntry } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import type { BenchTarget, RouteResult } from './engine.js'
import { runBench } from './engine.js'
import type { HonoSource } from './hono-source.js'
import { projectHonoSource, resolveHonoSource } from './hono-source.js'

export const agentContext: CommandAgentContext = {
  output:
    '{ "results": [{ "hono": "4.13.0", "routes": [{ "method": "GET", "path": "/users", "requests": 48210, "rps": 96420, "latency": { "avg": 0.01, "p50": 0.009, "p75": 0.011, "p99": 0.021 } }] }] }',
  errors: [
    'ENTRY_NOT_FOUND',
    'BUILD_FAILED',
    'INVALID_APP',
    'NO_ROUTES',
    'HONO_INSTALL_FAILED',
    'BENCH_FAILED',
  ],
  examples: [
    'hono benchmark',
    'hono benchmark -P /users',
    `hono benchmark -P /users -X POST -d '{"name":"Alice"}'`,
    'hono benchmark --hono 4.12.3 --hono 4.13.0',
    'hono benchmark --hono ../hono',
  ],
  notes: [
    'This is a micro benchmark of routing and handlers. It calls app.request() directly — no HTTP stack, no network.',
    'Each run happens in a fresh process, so results are comparable.',
    '--hono benchmarks the same app with another Hono: an npm version, or a path to a local checkout. Use it to compare Hono versions without touching the project.',
    '-X, -d, and -H set the method, body, and headers for -P paths. The route sweep stays GET only.',
    'A few percent of difference is noise. To compare, run it more than once and check the difference repeats.',
    'Latency is in milliseconds.',
  ],
}

const collect = (value: string, previous: string[]): string[] =>
  previous ? [...previous, value] : [value]

interface BenchmarkOptions {
  path: string[]
  method: string
  data?: string
  header: string[]
  duration: string
  warmup: string
  hono: string[]
  plain: boolean
  external?: string[]
}

export function benchmarkCommand(program: Command) {
  program
    .command('benchmark')
    .description('Measure the performance of your Hono app')
    .argument('[file]', 'Path to the Hono app file')
    .option(
      '-P, --path <path>',
      'benchmark only this path (can be used multiple times)',
      collect,
      []
    )
    .option('-X, --method <method>', 'HTTP method for -P paths', 'GET')
    .option('-d, --data <data>', 'request body for -P paths (@file reads a file, @- reads stdin)')
    .option(
      '-H, --header <header>',
      'custom headers for -P paths (can be used multiple times)',
      collect,
      [] as string[]
    )
    .option('--duration <ms>', 'how long to measure each route', '500')
    .option('--warmup <count>', 'requests before measuring', '30')
    .option(
      '--hono <version-or-path>',
      'benchmark with this Hono instead (can be used multiple times)',
      collect,
      [] as string[]
    )
    .option('--plain', 'human-readable output instead of JSON', false)
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      collect,
      [] as string[]
    )
    .action(
      handleErrors(async (file: string | undefined, options: BenchmarkOptions) => {
        const duration = Number(options.duration)
        const warmup = Number(options.warmup)
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(warmup) || warmup < 0) {
          throw new CliError('INVALID_OPTION', 'Invalid --duration or --warmup', {
            suggestions: ['Pass positive numbers: --duration 500 --warmup 30'],
          })
        }

        const method = (options.method || 'GET').toUpperCase()
        if (
          options.path.length === 0 &&
          (method !== 'GET' || options.data || options.header.length > 0)
        ) {
          throw new CliError('INVALID_OPTION', '-X, -d, and -H work only with -P paths', {
            suggestions: [
              'Pass the path too: hono benchmark -P /users -X POST -d \'{"name":"Alice"}\'',
            ],
          })
        }

        const external = options.external || []
        const entry = resolveEntry(file)
        const targets = await collectTargets(file, entry, options, method, external)

        const sources: HonoSource[] = []
        try {
          if (options.hono.length === 0) {
            sources.push(projectHonoSource())
          } else {
            for (const spec of options.hono) {
              sources.push(await resolveHonoSource(spec))
            }
          }

          const results: { hono: string; routes: RouteResult[] }[] = []
          for (const source of sources) {
            console.error(`Benchmarking with hono ${source.label} ...`)
            const routes = await runBench(entry, external, source, targets, { duration, warmup })
            results.push({ hono: source.label, routes })
          }

          if (options.plain) {
            printPlainResults(results)
            return
          }
          printResult({ results })
        } finally {
          for (const source of sources) {
            source.cleanup?.()
          }
        }
      })
    )
}

const collectTargets = async (
  file: string | undefined,
  entry: ReturnType<typeof resolveEntry>,
  options: BenchmarkOptions,
  method: string,
  external: string[]
): Promise<BenchTarget[]> => {
  if (options.path.length > 0) {
    const headers: Record<string, string> = {}
    for (const header of options.header) {
      const [key, value] = header.split(':', 2)
      if (key && value) {
        headers[key.trim()] = value.trim()
      }
    }
    const body = resolveData(options.data)
    return options.path.map((path) => ({
      method,
      path,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(body === undefined ? {} : { body }),
    }))
  }

  // Enumerate the GET routes of the app, like `hono routes`
  const buildIterator =
    typeof entry === 'string'
      ? getBuildIterator(file, false, external)
      : buildAndImportApp(entry, { external: ['@hono/node-server', ...external] })
  const app = (await buildIterator.next()).value
  if (!app || !Array.isArray(app.routes)) {
    throw new CliError('INVALID_APP', 'The app does not expose routes', {
      suggestions: ['Export the Hono instance as the default export'],
      docs: 'https://hono.dev/docs/api/hono',
    })
  }

  const seen = new Set<string>()
  const targets: BenchTarget[] = []
  for (const route of inspectRoutes(app)) {
    if (route.isMiddleware || route.method !== 'GET' || route.path.includes('*')) {
      continue
    }
    const path = route.path.replace(/:[^/]+/g, '1')
    if (seen.has(path)) {
      continue
    }
    seen.add(path)
    targets.push({ method: 'GET', path })
  }
  if (targets.length === 0) {
    throw new CliError('NO_ROUTES', 'No GET routes to benchmark', {
      suggestions: ['Pass a path: hono benchmark -P /'],
    })
  }
  return targets
}

const printPlainResults = (results: { hono: string; routes: RouteResult[] }[]): void => {
  for (const result of results) {
    console.log(`[hono ${result.hono}]`)
    const maxPathLength = Math.max(...result.routes.map(({ path }) => path.length), 0)
    for (const route of result.routes) {
      console.log(
        `  ${route.method} ${route.path.padEnd(maxPathLength)}  ${String(route.rps).padStart(8)} rps  p50 ${route.latency.p50}ms  p99 ${route.latency.p99}ms`
      )
    }
  }
}
