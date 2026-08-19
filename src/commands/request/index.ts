import type { Command } from 'commander'
import type { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { getFilenameFromPath, saveFile } from '../../utils/file.js'
import { getBuildIterator, readStdin } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { withTracer } from './trace.js'

export const agentContext: CommandAgentContext = {
  output:
    '{ "status": 200, "headers": { "content-type": "application/json" }, "body": { "message": "Hello" } }',
  errors: ['ENTRY_NOT_FOUND'],
  examples: [
    'hono request -P /api/users',
    `hono request -P /api/users -X POST -d '{"name":"Alice"}'`,
    'cat payload.json | hono request -P /api/users -X POST -d @-',
    'hono request -P /api/users/123 --trace',
    `echo 'app.get("/hello", (c) => c.json({ ok: true }))' | hono request - -P /hello`,
  ],
  notes: [
    'No server needed. The request goes directly to app.request().',
    'Pass - as the file to read the app code from stdin. `app` is predefined and exported for you — write only routes. Code with its own `export default` is used as-is.',
    '-d @file reads the body from a file, -d @- reads it from stdin.',
    '--trace adds matchedRoutes to the output: which middleware and handler matched, and which one responded. Use it to debug an unexpected response.',
    'A JSON response body is embedded as an object. A binary body becomes null with "binary": true — save it with -o.',
  ],
}

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  path?: string
  watch: boolean
  plain: boolean
  trace: boolean
  output?: string
  remoteName: boolean
  include: boolean
  head: boolean
  external?: string[]
}

export function requestCommand(program: Command) {
  program
    .command('request')
    .description('Send request to Hono app using app.request()')
    .argument('[file]', 'Path to the Hono app file')
    .option('-P, --path <path>', 'Request path', '/')
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
      handleErrors(async (file: string | undefined, options: RequestOptions) => {
        const doSaveFile = options.output || options.remoteName
        const path = options.path || '/'
        const watch = options.watch
        const external = options.external || []
        if (options.trace && options.plain) {
          throw new CliError('INVALID_OPTION', 'Cannot use --trace with --plain', {
            suggestions: ['Drop --plain. The trace is part of the JSON output'],
          })
        }
        if (file === '-' && options.data === '@-') {
          throw new CliError('INVALID_OPTION', 'Cannot read both the app and the body from stdin', {
            suggestions: ['Pass the app as a file, or the body with -d @file'],
          })
        }
        options.data = resolveData(options.data)
        const buildIterator = getBuildIterator(file, watch, external)
        for await (const app of buildIterator) {
          const traced = options.trace ? withTracer(app) : undefined
          const result = await executeRequest(traced?.app ?? app, path, options)
          const contentType = result.headers['content-type']
          const buffer = await result.response.clone().arrayBuffer()
          const isBinaryData = isBinaryResponse(buffer)

          let savedTo: string | undefined
          if (doSaveFile) {
            savedTo = await handleSaveOutput(buffer, path, options, contentType)
          }

          if (options.plain) {
            printPlain(result, contentType, isBinaryData, savedTo, options)
            continue
          }

          printResult({
            status: result.status,
            headers: result.headers,
            body: isBinaryData ? null : parseBody(result.body, contentType),
            ...(isBinaryData ? { binary: true } : {}),
            ...(savedTo ? { savedTo } : {}),
            ...(traced ? { matchedRoutes: traced.getTrace() } : {}),
          })
        }
      })
    )
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

const resolveData = (data: string | undefined): string | undefined => {
  if (data === undefined || !data.startsWith('@')) {
    return data
  }
  if (data === '@-') {
    return readStdin()
  }
  return readFileSync(data.slice(1), 'utf-8')
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
    const headers = new Headers()
    for (const header of options.header) {
      const [key, value] = header.split(':', 2)
      if (key && value) {
        headers.set(key.trim(), value.trim())
      }
    }
    requestInit.headers = headers
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
