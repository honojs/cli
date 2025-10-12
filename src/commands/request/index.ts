import type { Command } from 'commander'
import * as esbuild from 'esbuild'
import type { Hono } from 'hono'
import { existsSync, realpathSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  path?: string
}

export function requestCommand(program: Command) {
  program
    .command('request')
    .description('Send request to Hono app using app.request()')
    .argument('[file]', 'Path to the Hono app file')
    .option('-P, --path <path>', 'Request path', '/')
    .option('-X, --method <method>', 'HTTP method', 'GET')
    .option('-d, --data <data>', 'Request body data')
    .option('-H, --header <header>', 'Custom headers', [])
    .action(async (file: string | undefined, options: RequestOptions) => {
      const path = options.path || '/'
      const result = await executeRequest(file, path, options)
      console.log(JSON.stringify(result, null, 2))
    })
}

export async function executeRequest(
  appPath: string | undefined,
  requestPath: string,
  options: RequestOptions
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
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

  const ext = extname(entry)

  if (!existsSync(resolvedAppPath)) {
    throw new Error(`Entry file ${entry} does not exist`)
  }

  let app: Hono
  const appFilePath = realpathSync(resolvedAppPath)

  if (['.ts', '.tsx', '.jsx'].includes(ext)) {
    // Use esbuild to bundle TypeScript/JSX files
    const result = await esbuild.build({
      entryPoints: [appFilePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'node20',
      jsx: 'automatic',
      jsxImportSource: 'hono/jsx',
      platform: 'node',
      external: ['@hono/node-server'],
    })

    // Execute the bundled code using data URL
    const code = result.outputFiles[0].text
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    const module = await import(dataUrl)
    app = module.default
  } else {
    // Regular JS files can be imported directly
    const module = await import(pathToFileURL(appFilePath).href)
    app = module.default
  }

  if (!app || typeof app.request !== 'function') {
    throw new Error('No valid Hono app exported from the file')
  }

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
