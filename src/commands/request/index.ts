import type { Command } from 'commander'
import type { Hono } from 'hono'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAndImportApp } from '../../utils/build.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  path?: string
  watch: boolean
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
    .action(async (file: string | undefined, options: RequestOptions) => {
      const path = options.path || '/'
      const watch = options.watch
      const buildIterator = getBuildIterator(file, watch)
      for await (const app of buildIterator) {
        const result = await executeRequest(app, path, options)
        console.log(JSON.stringify(result, null, 2))
      }
    })
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
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
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

  const body = await response.text()

  return {
    status: response.status,
    body,
    headers: responseHeaders,
  }
}
