import type { Command } from 'commander'
import type { Hono } from 'hono'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAndImportApp } from '../../utils/build.js'
import { getFilenameFromPath, saveFile } from '../../utils/file.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  path?: string
  watch: boolean
  plain: boolean
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
    .option('-d, --data <data>', 'Request body data')
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
        const buildIterator = getBuildIterator(file, watch, external)
        for await (const app of buildIterator) {
          const result = await executeRequest(app, path, options)
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

export function getBuildIterator(
  appPath: string | undefined,
  watch: boolean,
  external: string[] = []
): AsyncGenerator<Hono> {
  // Determine entry file path
  let entry: string
  let resolvedAppPath: string

  if (appPath) {
    // If appPath is provided, use it as-is (could be relative or absolute)
    entry = appPath
    resolvedAppPath = resolve(process.cwd(), entry)
  } else {
    // Use default candidates
    entry =
      DEFAULT_ENTRY_CANDIDATES.find((candidate) => existsSync(resolve(process.cwd(), candidate))) ??
      DEFAULT_ENTRY_CANDIDATES[0]
    resolvedAppPath = resolve(process.cwd(), entry)
  }

  if (!existsSync(resolvedAppPath)) {
    throw new CliError(
      'ENTRY_NOT_FOUND',
      `Entry file ${entry} does not exist`,
      'Pass an existing app file: hono request src/index.ts'
    )
  }

  const appFilePath = realpathSync(resolvedAppPath)
  return buildAndImportApp(appFilePath, {
    external: ['@hono/node-server', ...external],
    watch,
    sourcemap: true,
  })
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
