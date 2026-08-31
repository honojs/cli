import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
 * The script imports the bundled app, sends the request, and writes the
 * response to a file. stdout stays free for the app's own logs.
 */
export const buildRunnerScript = (
  bundleUrl: string,
  resultPath: string,
  request: RunnerRequest
): string => `import { writeFileSync } from 'node:fs'
import app from ${JSON.stringify(bundleUrl)}

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
writeFileSync(
  ${JSON.stringify(resultPath)},
  JSON.stringify({ status: response.status, headers, bodyBase64: btoa(binary) })
)
`

interface RunnerCommand {
  bin: string
  args: (dir: string) => string[]
  install: string
}

const RUNNER_COMMANDS: Record<Exclude<Runtime, 'node'>, RunnerCommand> = {
  bun: { bin: 'bun', args: () => [], install: 'Install Bun: https://bun.sh' },
  deno: {
    bin: 'deno',
    args: (dir) => ['run', '--quiet', `--allow-write=${dir}`],
    install: 'Install Deno: https://deno.com',
  },
}

export const runInRuntime = async (
  runtime: Exclude<Runtime, 'node'>,
  bundleCode: string,
  request: RunnerRequest
): Promise<RunnerResponse> => {
  // Under node_modules so that packages marked as external still resolve
  const base = join(process.cwd(), 'node_modules', '.hono-cli')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'run-'))

  try {
    const bundlePath = join(dir, 'app.mjs')
    const runnerPath = join(dir, 'runner.mjs')
    const resultPath = join(dir, 'result.json')
    writeFileSync(bundlePath, bundleCode)
    writeFileSync(
      runnerPath,
      buildRunnerScript(pathToFileURL(bundlePath).href, resultPath, request)
    )

    const command = RUNNER_COMMANDS[runtime]
    await execRunner(runtime, command.bin, [...command.args(dir), runnerPath], command.install)

    return JSON.parse(readFileSync(resultPath, 'utf-8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const execRunner = (runtime: string, bin: string, args: string[], install: string): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      // The app's own logs go to stderr
      if (stdout) {
        process.stderr.write(stdout)
      }
      if (stderr) {
        process.stderr.write(stderr)
      }
      if (!error) {
        resolvePromise()
        return
      }
      if ('code' in error && error.code === 'ENOENT') {
        reject(
          new CliError('RUNTIME_NOT_FOUND', `${bin} is not installed`, {
            suggestions: [install, 'Or drop --runtime to run on Node.js'],
          })
        )
        return
      }
      reject(
        new CliError('RUNTIME_FAILED', `The app failed on ${runtime}`, {
          suggestions: ['Check the error output above'],
        })
      )
    })
  })
