import type { Command } from 'commander'
import type { Hono } from 'hono'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAndImportApp } from '../../utils/build.js'
import { getFilenameFromPath, saveFile } from '../../utils/file.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  path?: string
  watch: boolean
  json: boolean
  output?: string
  remoteName: boolean
  include: boolean
  head: boolean
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
    .option('-J, --json', 'Output response as JSON', false)
    .option(
      '-H, --header <header>',
      'Custom headers',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .option('-O, --remote-name', 'Write output to file named as remote file', false)
    .option('-i, --include', 'Include protocol and headers in the output', false)
    .option('-I, --head', 'Show only protocol and headers in the output', false)
    .action(async (file: string | undefined, options: RequestOptions) => {
      const doSaveFile = options.output || options.remoteName
      const path = options.path || '/'
      const watch = options.watch
      const buildIterator = getBuildIterator(file, watch)
      for await (const app of buildIterator) {
        const result = await executeRequest(app, path, options)
        const contentType = result.headers['content-type']
        const outputBody = formatResponseBody(
          result.body,
          contentType,
          options.json && !options.include
        )
        const buffer = await result.response.clone().arrayBuffer()
        const isBinaryData = isBinaryResponse(buffer)
        if (isBinaryData && !doSaveFile) {
          console.warn('Binary output can mess up your terminal.')
          continue
        }

        const outputData = getOutputData(
          buffer,
          outputBody,
          isBinaryData,
          options,
          result.status,
          result.headers
        )
        if (!isBinaryData) {
          console.log(outputData)
        }

        if (doSaveFile) {
          await handleSaveOutput(outputData, path, options, contentType)
        }
      }
    })
}

function getOutputData(
  buffer: ArrayBuffer,
  outputBody: string | object,
  isBinaryData: boolean,
  options: RequestOptions,
  status: number,
  headers: Record<string, string>
): string | ArrayBuffer | object {
  if (isBinaryData) {
    return buffer
  }

  const headerLines: string[] = []
  headerLines.push(`${status}`)
  for (const key in headers) {
    headerLines.push(`\x1b[1m${key}\x1b[0m: ${headers[key]}`)
  }
  const headerOutput = headerLines.join('\n')
  if (options.head) {
    return headerOutput + '\n'
  }
  if (options.include) {
    return headerOutput + '\n\n' + outputBody
  }

  if (options.json) {
    return JSON.stringify({ status: status, body: outputBody, headers: headers }, null, 2)
  }
  return outputBody
}

async function handleSaveOutput(
  saveData: string | ArrayBuffer | object,
  requestPath: string,
  options: RequestOptions,
  contentType?: string
): Promise<void> {
  let filepath: string
  if (options.output) {
    filepath = options.output
  } else {
    filepath = getFilenameFromPath(requestPath, contentType)
  }
  try {
    await saveFile(
      typeof saveData === 'string'
        ? new TextEncoder().encode(saveData).buffer
        : saveData instanceof ArrayBuffer
          ? saveData
          : new TextEncoder().encode(JSON.stringify(saveData)).buffer,
      filepath
    )
    console.log(`Saved response to ${filepath}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Error saving file: ${error.message}`)
  }
}

export function getBuildIterator(
  appPath: string | undefined,
  watch: boolean
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
    throw new Error(`Entry file ${entry} does not exist`)
  }

  const appFilePath = realpathSync(resolvedAppPath)
  return buildAndImportApp(appFilePath, {
    external: ['@hono/node-server'],
    watch,
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

const formatResponseBody = (
  responseBody: string,
  contentType: string | undefined,
  jsonOption: boolean
): string | object => {
  if (contentType && /^application\/(json|[^;\s]+\+json)($|;)/i.test(contentType)) {
    try {
      const parsedJSON = JSON.parse(responseBody)
      if (jsonOption) {
        return parsedJSON
      }
      return JSON.stringify(parsedJSON, null, 2)
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
