import * as esbuild from 'esbuild'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { AppEntry } from '../../utils/build.js'
import { CliError } from '../../utils/output.js'
import { parseRunnerOutput } from '../request/runtime.js'
import type { HonoSource } from './hono-source.js'

export interface BenchTarget {
  method: string
  path: string
  headers?: Record<string, string>
  body?: string
}

export interface BenchOptions {
  duration: number
  warmup: number
}

export interface RouteResult {
  method: string
  path: string
  requests: number
  rps: number
  latency: { avg: number; p50: number; p75: number; p99: number }
}

/**
 * The bench body runs after the app import in a fresh process, so
 * versions do not share JIT or GC state.
 */
export const buildBenchBody = (
  targets: BenchTarget[],
  options: BenchOptions,
  marker: string
): string => `
const targets = ${JSON.stringify(targets)}
const options = ${JSON.stringify(options)}
const handler = typeof app.request === 'function' ? app.request.bind(app) : app.fetch.bind(app)
const routes = []
for (const target of targets) {
  const send = async () => {
    const response = await handler(
      new Request('http://localhost' + target.path, {
        method: target.method,
        headers: target.headers ?? {},
        ...(target.body === undefined ? {} : { body: target.body }),
      })
    )
    await response.arrayBuffer()
  }
  for (let i = 0; i < options.warmup; i++) {
    await send()
  }
  const times = []
  const started = performance.now()
  const until = started + options.duration
  let now = started
  while (now < until) {
    const before = now
    await send()
    now = performance.now()
    times.push(now - before)
  }
  times.sort((a, b) => a - b)
  const total = now - started
  const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))] ?? 0
  const round = (value) => Math.round(value * 1000000) / 1000000
  routes.push({
    method: target.method,
    path: target.path,
    requests: times.length,
    rps: Math.round((times.length / total) * 1000),
    latency: {
      avg: round(total / times.length),
      p50: round(at(0.5)),
      p75: round(at(0.75)),
      p99: round(at(0.99)),
    },
  })
}
console.log(${JSON.stringify(marker)} + JSON.stringify({ routes }))
`

/**
 * Bundle the app with the bench body. When the source has a
 * resolveDir, `hono` imports resolve there instead of the project.
 */
export const buildBenchBundle = async (
  entry: AppEntry,
  external: string[],
  source: HonoSource,
  body: string
): Promise<string> => {
  const plugins: esbuild.Plugin[] = []
  if (typeof entry !== 'string') {
    plugins.push({
      name: 'virtual-app',
      setup(build) {
        build.onResolve({ filter: /^virtual:app$/ }, () => ({
          path: 'virtual:app',
          namespace: 'virtual',
        }))
        build.onLoad({ filter: /^virtual:app$/, namespace: 'virtual' }, () => ({
          contents: (entry as { code: string }).code,
          loader: 'tsx',
          resolveDir: process.cwd(),
        }))
      },
    })
  }
  const aliasDir = source.resolveDir
  if (aliasDir) {
    plugins.push({
      name: 'hono-alias',
      setup(build) {
        build.onResolve({ filter: /^hono($|\/)/ }, async (args) => {
          if (args.pluginData === 'hono-alias') {
            return undefined
          }
          return build.resolve(args.path, {
            kind: 'import-statement',
            resolveDir: aliasDir,
            pluginData: 'hono-alias',
          })
        })
      },
    })
  }

  const importSource = typeof entry === 'string' ? entry : 'virtual:app'
  const result = await esbuild.build({
    stdin: {
      contents: `import app from ${JSON.stringify(importSource)}\n${body}`,
      resolveDir: process.cwd(),
      loader: 'tsx',
      sourcefile: '__bench__.tsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    target: 'esnext',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    external,
    plugins,
  })
  return result.outputFiles[0].text
}

export const runBench = async (
  entry: AppEntry,
  external: string[],
  source: HonoSource,
  targets: BenchTarget[],
  options: BenchOptions
): Promise<RouteResult[]> => {
  const marker = `__HONO_CLI_BENCH_${randomUUID()}__`
  const body = buildBenchBody(targets, options, marker)
  const code = await buildBenchBundle(entry, external, source, body)
  const stdout = await execNode(code)
  return parseRunnerOutput<{ routes: RouteResult[] }>(stdout, marker, 'node').routes
}

const execNode = (code: string): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const child = execFile(
      process.execPath,
      ['--input-type=module'],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (stderr) {
          process.stderr.write(stderr)
        }
        if (error) {
          if (stdout) {
            process.stderr.write(stdout)
          }
          reject(
            new CliError('BENCH_FAILED', 'The benchmark failed', {
              suggestions: ['Check the error output above'],
            })
          )
          return
        }
        resolvePromise(stdout)
      }
    )
    child.stdin?.end(code)
  })
