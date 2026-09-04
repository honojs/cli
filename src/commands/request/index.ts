import type { Command } from 'commander'
import type { Hono } from 'hono'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { getFilenameFromPath, saveFile } from '../../utils/file.js'
import { getBuildIterator, readStdin, resolveData, resolveEntry } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { parseBatch, runBatch } from './batch.js'
import { resolvePositionals } from './positionals.js'
import type { Runtime } from './runtime.js'
import { RUNTIMES, runInRuntime } from './runtime.js'
import { withTracer } from './trace.js'
import { runOnWorkerd } from './workerd.js'

export const agentContext: CommandAgentContext = {
  output:
    '{ "status": 200, "headers": { "content-type": "application/json" }, "body": { "message": "Hello" } }',
  errors: [
    'ENTRY_NOT_FOUND',
    'BUILD_FAILED',
    'INVALID_APP',
    'RUNTIME_NOT_FOUND',
    'RUNTIME_FAILED',
    'WRANGLER_NOT_FOUND',
    'WRANGLER_CONFIG_NOT_FOUND',
    'BATCH_INVALID',
    'BATCH_NOT_FOUND',
  ],
  examples: [
    'hono request /api/users',
    `hono request /api/users -X POST -d '{"name":"Alice"}'`,
    'cat payload.json | hono request /api/users -X POST -d @-',
    'hono request /api/users/123 --trace',
    'hono request / --runtime bun',
    'hono request /api --runtime workerd',
    `echo 'app.get("/hello", (c) => c.json({ ok: true }))' | hono request /hello -`,
    `hono request --batch - <<'EOF'
{"path":"/users"}
{"method":"POST","path":"/users","body":{"name":"Momo"},"save":{"id":".id"}}
{"path":"/users/{{id}}"}
EOF`,
  ],
  notes: [
    'No server needed. The request goes directly to app.request().',
    'Pass - as the file to read the app code from stdin. `app` is predefined and exported for you — write only routes. Code with its own `export default` is used as-is.',
    '-d @file reads the body from a file, -d @- reads it from stdin.',
    '--runtime runs the app on bun, deno, or workerd instead of Node.js. bun and deno must be installed. workerd starts the app with the wrangler config of the project, so the local bindings (c.env) are real — it needs wrangler installed and no file argument.',
    '--trace adds matchedRoutes to the output: which middleware and handler matched, and which one responded. Use it to debug an unexpected response. A 404 result includes a suggestion to run it.',
    'A JSON response body is embedded as an object. A binary body becomes null with "binary": true — save it with -o.',
    '--batch runs many requests in one call, in order, against one app instance — in-memory state carries between steps. One JSON object per line: {"method","path","body","headers","save"}. "save" stores a value from the response body by dot path (e.g. {"id":".id"}), and later steps use it as {{id}}. Prefer --batch over writing a test script: no file to clean up.',
    'The --batch output is one result per step: status and body as facts. Compare them with what you expect — read the bodies too, a right status can hide a wrong body.',
  ],
}

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  watch: boolean
  plain: boolean
  trace: boolean
  runtime: string
  output?: string
  remoteName: boolean
  include: boolean
  head: boolean
  external?: string[]
  batch?: string
}

export function requestCommand(program: Command) {
  program
    .command('request')
    .description('Send request to Hono app using app.request()')
    .argument('[path]', 'Request path, like the URL in curl')
    .argument('[file]', 'Path to the Hono app file')
    .option('-X, --method <method>', 'HTTP method', 'GET')
    .option('-d, --data <data>', 'Request body data (@file reads a file, @- reads stdin)')
    .option('-w, --watch', 'Watch for changes and resend request', false)
    .option(
      '-H, --header <header>',
      'Custom headers',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .option('-o, --output <file>', 'Write response body to file instead of stdout')
    .option('-O, --remote-name', 'Write response body to file named as remote file', false)
    .option('--plain', 'human-readable output instead of JSON', false)
    .option('--trace', 'include matched routes in the output', false)
    .option(
      '--runtime <runtime>',
      'runtime to execute the app (node | bun | deno | workerd)',
      'node'
    )
    .option('--batch <source>', 'Run multiple requests from JSONL (- reads stdin)')
    .option('-i, --include', 'Include protocol and headers in the output (with --plain)', false)
    .option('-I, --head', 'Show only protocol and headers in the output (with --plain)', false)
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .action(
      handleErrors(
        async (
          pathArg: string | undefined,
          fileArg: string | undefined,
          options: RequestOptions
        ) => {
          const { path = '/', file } = resolvePositionals(pathArg, fileArg, Boolean(options.batch))

          const doSaveFile = options.output || options.remoteName
          const watch = options.watch
          const external = options.external || []
          if (!RUNTIMES.includes(options.runtime as Runtime)) {
            throw new CliError('INVALID_OPTION', `Unknown runtime: ${options.runtime}`, {
              suggestions: ['Use one of: node, bun, deno, workerd'],
            })
          }
          const runtime = options.runtime as Runtime
          if (runtime !== 'node' && (options.watch || options.trace)) {
            throw new CliError(
              'INVALID_OPTION',
              `Cannot use --watch or --trace with --runtime ${runtime}`,
              {
                suggestions: ['Drop --watch and --trace, or use --runtime node'],
              }
            )
          }
          if (options.batch) {
            if (runtime !== 'node') {
              throw new CliError('INVALID_OPTION', 'Cannot use --batch with --runtime yet', {
                suggestions: ['Drop --runtime. The batch runs on Node.js for now'],
              })
            }
            const perRequest =
              options.trace ||
              options.watch ||
              options.plain ||
              options.data !== undefined ||
              options.output !== undefined ||
              options.remoteName ||
              options.include ||
              options.head ||
              options.method !== 'GET'
            if (perRequest) {
              throw new CliError('INVALID_OPTION', 'Cannot use --batch with per-request options', {
                suggestions: ['Put method, path, and body in the batch lines'],
              })
            }
            if (file === '-' && options.batch === '-') {
              throw new CliError(
                'INVALID_OPTION',
                'Cannot read both the app and the batch from stdin',
                {
                  suggestions: ['Pass the app as a file, or the batch with --batch <file>'],
                }
              )
            }
            const source = options.batch === '-' ? await readStdin() : readBatchFile(options.batch)
            const steps = parseBatch(source)
            for await (const app of getBuildIterator(file, false, external)) {
              printResult(await runBatch(app, steps, parseHeaders(options.header)))
            }
            return
          }

          if (options.trace && options.plain) {
            throw new CliError('INVALID_OPTION', 'Cannot use --trace with --plain', {
              suggestions: ['Drop --plain. The trace is part of the JSON output'],
            })
          }
          if (file === '-' && options.data === '@-') {
            throw new CliError(
              'INVALID_OPTION',
              'Cannot read both the app and the body from stdin',
              {
                suggestions: ['Pass the app as a file, or the body with -d @file'],
              }
            )
          }
          options.data = resolveData(options.data)

          if (runtime === 'workerd') {
            if (file !== undefined) {
              throw new CliError(
                'INVALID_OPTION',
                'workerd runs the app from your wrangler config',
                {
                  suggestions: [
                    'Drop the file argument. The entry is `main` in the wrangler config',
                  ],
                }
              )
            }
            const result = await runOnWorkerd({
              path,
              method: options.method || 'GET',
              headers: parseHeaders(options.header),
              ...(options.data === undefined ? {} : { body: options.data }),
            })
            await printResponse(result, path, options, doSaveFile, { runtime })
            return
          }

          if (runtime !== 'node') {
            const runnerResponse = await runInRuntime(runtime, resolveEntry(file), external, {
              path,
              method: options.method || 'GET',
              headers: parseHeaders(options.header),
              ...(options.data === undefined ? {} : { body: options.data }),
            })
            const bytes = Buffer.from(runnerResponse.bodyBase64, 'base64')
            const result = {
              status: runnerResponse.status,
              headers: runnerResponse.headers,
              body: new TextDecoder().decode(bytes),
              response: new Response(bytes, {
                status: runnerResponse.status,
                headers: runnerResponse.headers,
              }),
            }
            await printResponse(result, path, options, doSaveFile, { runtime })
            return
          }

          const buildIterator = getBuildIterator(file, watch, external)
          for await (const app of buildIterator) {
            const traced = options.trace ? withTracer(app) : undefined
            const result = await executeRequest(traced?.app ?? app, path, options)
            await printResponse(result, path, options, doSaveFile, {
              ...(traced ? { matchedRoutes: traced.getTrace() } : {}),
            })
          }
        }
      )
    )
}

const printResponse = async (
  result: { status: number; body: string; headers: Record<string, string>; response: Response },
  path: string,
  options: RequestOptions,
  doSaveFile: string | boolean | undefined,
  extra: Record<string, unknown>
): Promise<void> => {
  const contentType = result.headers['content-type']
  const buffer = await result.response.clone().arrayBuffer()
  const isBinaryData = isBinaryResponse(buffer)

  let savedTo: string | undefined
  if (doSaveFile) {
    savedTo = await handleSaveOutput(buffer, path, options, contentType)
  }

  if (options.plain) {
    printPlain(result, contentType, isBinaryData, savedTo, options)
    return
  }

  // Agents rarely discover --trace on their own. A 404 is the moment
  // it helps, so point at it right there.
  const suggestTrace = result.status === 404 && !options.trace && options.runtime === 'node'

  printResult({
    status: result.status,
    headers: result.headers,
    body: isBinaryData ? null : parseBody(result.body, contentType),
    ...(isBinaryData ? { binary: true } : {}),
    ...(savedTo ? { savedTo } : {}),
    ...(suggestTrace
      ? { suggestions: [`See which routes matched: hono request ${path} --trace`] }
      : {}),
    ...extra,
  })
}

const printPlain = (
  result: { status: number; body: string; headers: Record<string, string> },
  contentType: string | undefined,
  isBinaryData: boolean,
  savedTo: string | undefined,
  options: RequestOptions
): void => {
  if (isBinaryData) {
    if (!savedTo) {
      console.warn('Binary output can mess up your terminal.')
    }
    return
  }

  const headerLines: string[] = []
  headerLines.push(`${result.status}`)
  for (const key in result.headers) {
    headerLines.push(`\x1b[1m${key}\x1b[0m: ${result.headers[key]}`)
  }
  const headerOutput = headerLines.join('\n')

  const body = parseBody(result.body, contentType)
  const outputBody = typeof body === 'string' ? body : JSON.stringify(body, null, 2)

  if (options.head) {
    console.log(headerOutput + '\n')
  } else if (options.include) {
    console.log(headerOutput + '\n\n' + outputBody)
  } else {
    console.log(outputBody)
  }
}

const handleSaveOutput = async (
  buffer: ArrayBuffer,
  requestPath: string,
  options: RequestOptions,
  contentType?: string
): Promise<string | undefined> => {
  const filepath = options.output ?? getFilenameFromPath(requestPath, contentType)
  try {
    await saveFile(buffer, filepath)
    console.error(`Saved response to ${filepath}`)
    return filepath
  } catch (error) {
    console.error(`Error saving file: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

const readBatchFile = (source: string): string => {
  const filepath = resolve(process.cwd(), source)
  if (!existsSync(filepath)) {
    throw new CliError('BATCH_NOT_FOUND', `Batch file ${source} does not exist`, {
      suggestions: ['Pass a JSONL file, or - to read stdin'],
    })
  }
  return readFileSync(filepath, 'utf-8')
}

const parseHeaders = (header: string[] | undefined): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const entry of header ?? []) {
    const [key, value] = entry.split(':', 2)
    if (key && value) {
      headers[key.trim()] = value.trim()
    }
  }
  return headers
}

export async function executeRequest(
  app: Hono,
  requestPath: string,
  options: RequestOptions
): Promise<{ status: number; body: string; headers: Record<string, string>; response: Response }> {
  // Build request
  const url = new URL(requestPath, 'http://localhost')
  const requestInit: RequestInit = {
    method: options.method || 'GET',
  }

  // Add request body if provided
  if (options.data) {
    requestInit.body = options.data
  }

  // Add headers if provided
  if (options.header && options.header.length > 0) {
    requestInit.headers = parseHeaders(options.header)
  }

  // Execute request
  const request = new Request(url.href, requestInit)
  const response = await app.request(request)

  // Convert response to our format
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  const body = await response.clone().text()

  return {
    status: response.status,
    body,
    headers: responseHeaders,
    response: response,
  }
}

/**
 * Parse a JSON body into an object so it is not double-escaped in the
 * JSON output. Returns the body as-is for other content types.
 */
const parseBody = (responseBody: string, contentType: string | undefined): string | object => {
  if (contentType && /^application\/(json|[^;\s]+\+json)($|;)/i.test(contentType)) {
    try {
      return JSON.parse(responseBody)
    } catch {
      console.error('Response indicated JSON content type but failed to parse JSON.')
      return responseBody
    }
  }
  return responseBody
}

const isBinaryResponse = (buffer: ArrayBuffer): boolean => {
  const view = new Uint8Array(buffer)
  const len = Math.min(view.length, 2000)
  for (let i = 0; i < len; i++) {
    if (view[i] === 0) {
      return true
    }
  }
  return false
}
