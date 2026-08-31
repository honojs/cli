import * as esbuild from 'esbuild'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { AppEntry } from '../../utils/build.js'
import { CliError } from '../../utils/output.js'

export const RUNTIMES = ['node', 'bun', 'deno'] as const
export type Runtime = (typeof RUNTIMES)[number]

export interface RunnerRequest {
  path: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface RunnerResponse {
  status: number
  headers: Record<string, string>
  bodyBase64: string
}

/**
 * The runner runs after the app import. It sends the request and prints
 * the response as one marker line, so the app's own logs cannot break
 * the protocol.
 */
export const buildRunnerBody = (request: RunnerRequest, marker: string): string => `
const req = ${JSON.stringify(request)}
const target = new Request(new URL(req.path, 'http://localhost'), {
  method: req.method,
  headers: req.headers,
  ...(req.body === undefined ? {} : { body: req.body }),
})
const handler = typeof app.request === 'function' ? app.request.bind(app) : app.fetch.bind(app)
const response = await handler(target)
const bytes = new Uint8Array(await response.arrayBuffer())
let binary = ''
for (let i = 0; i < bytes.length; i += 0x8000) {
  binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
}
const headers = {}
response.headers.forEach((value, key) => {
  headers[key] = value
})
console.log(
  ${JSON.stringify(marker)} + JSON.stringify({ status: response.status, headers, bodyBase64: btoa(binary) })
)
`

const virtualAppPlugin = (code: string): esbuild.Plugin => ({
  name: 'virtual-app',
  setup(build) {
    build.onResolve({ filter: /^virtual:app$/ }, () => ({
      path: 'virtual:app',
      namespace: 'virtual',
    }))
    build.onLoad({ filter: /^virtual:app$/, namespace: 'virtual' }, () => ({
      contents: code,
      loader: 'tsx',
      resolveDir: process.cwd(),
    }))
  },
})

interface RunnerCommand {
  bin: string
  args: string[]
  install: string
}

const RUNNER_COMMANDS: Record<Exclude<Runtime, 'node'>, RunnerCommand> = {
  bun: { bin: 'bun', args: ['run', '-'], install: 'Install Bun: https://bun.sh' },
  deno: { bin: 'deno', args: ['run', '--quiet', '-'], install: 'Install Deno: https://deno.com' },
}

/**
 * Bundle the app together with the runner and pipe it to the runtime.
 * No files are written. Packages marked as external resolve from the
 * working directory.
 */
export const runInRuntime = async (
  runtime: Exclude<Runtime, 'node'>,
  entry: AppEntry,
  external: string[],
  request: RunnerRequest
): Promise<RunnerResponse> => {
  const marker = `__HONO_CLI_RESULT_${randomUUID()}__`
  const body = buildRunnerBody(request, marker)
  const [importSource, plugins] =
    typeof entry === 'string' ? [entry, []] : ['virtual:app', [virtualAppPlugin(entry.code)]]

  const built = await esbuild.build({
    stdin: {
      contents: `import app from ${JSON.stringify(importSource)}\n${body}`,
      resolveDir: process.cwd(),
      loader: 'tsx',
      sourcefile: '__runner__.tsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    target: 'esnext',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    external: ['@hono/node-server', ...external],
    plugins,
  })

  const command = RUNNER_COMMANDS[runtime]
  const stdout = await execRunner(runtime, command, built.outputFiles[0].text)
  return parseRunnerOutput(stdout, marker, runtime)
}

const execRunner = (runtime: string, command: RunnerCommand, code: string): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const child = execFile(
      command.bin,
      command.args,
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // The app's own logs go to stderr
        if (stderr) {
          process.stderr.write(stderr)
        }
        if (!error) {
          resolvePromise(stdout)
          return
        }
        if (stdout) {
          process.stderr.write(stdout)
        }
        if ('code' in error && error.code === 'ENOENT') {
          reject(
            new CliError('RUNTIME_NOT_FOUND', `${command.bin} is not installed`, {
              suggestions: [command.install, 'Or drop --runtime to run on Node.js'],
            })
          )
          return
        }
        reject(
          new CliError('RUNTIME_FAILED', `The app failed on ${runtime}`, {
            suggestions: ['Check the error output above'],
          })
        )
      }
    )
    child.stdin?.end(code)
  })

export const parseRunnerOutput = (
  stdout: string,
  marker: string,
  runtime: string
): RunnerResponse => {
  const lines = stdout.split('\n')
  const resultLine = lines.find((line) => line.includes(marker))
  const logs = lines.filter((line) => line !== resultLine && line.length > 0)
  if (logs.length > 0) {
    process.stderr.write(logs.join('\n') + '\n')
  }
  if (resultLine === undefined) {
    throw new CliError('RUNTIME_FAILED', `No result from ${runtime}`, {
      suggestions: ['Check the error output above'],
    })
  }
  return JSON.parse(resultLine.slice(resultLine.indexOf(marker) + marker.length))
}
