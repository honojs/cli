import type { Tako, TakoArgs, TakoHandler } from '@takojs/tako'
import type { Hono } from 'hono'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import * as process from 'node:process'
import { buildAndImportApp } from '../../utils/build.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

interface RequestOptions {
  method?: string
  data?: string
  header?: string[]
  path?: string
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

async function executeRequest(
  c: Tako,
  app: Hono
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  if (!app || typeof app.request !== 'function') {
    throw new Error('No valid Hono app exported from the file')
  }

  const { path: requestPath, method, data, header } = c.scriptArgs.values as RequestOptions

  // Build request
  const url = new URL(requestPath || '/', 'http://localhost')
  const requestInit: RequestInit = {
    method: method || 'GET',
  }

  // Add request body if provided
  if (data) {
    requestInit.body = data
  }

  // Add headers if provided
  if (header && header.length > 0) {
    const headers = new Headers()
    for (const h of header) {
      const [key, value] = h.split(':', 2)
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

export const requestArgs: TakoArgs = {
  config: {
    options: {
      path: {
        type: 'string',
        short: 'P',
        default: '/',
      },
      method: {
        type: 'string',
        short: 'X',
        default: 'GET',
      },
      data: {
        type: 'string',
        short: 'd',
      },
      header: {
        type: 'string',
        short: 'H',
        multiple: true,
      },
      watch: {
        type: 'boolean',
        short: 'w',
        default: false,
      },
    },
  },
  metadata: {
    help: 'Send request to Hono app using app.request()',
    placeholder: '[file]',
    options: {
      path: {
        help: 'Request path',
        placeholder: '<path>',
      },
      method: {
        help: 'HTTP method',
        placeholder: '<method>',
      },
      data: {
        help: 'Request body data',
        placeholder: '<data>',
      },
      header: {
        help: 'Custom headers',
        placeholder: '<header>',
      },
      watch: {
        help: 'Watch for changes and resend request',
        placeholder: '<header>',
      },
    },
  },
}

export const requestValidation: TakoHandler = async (_c, next) => {
  await next()
}

export const requestCommand: TakoHandler = async (c) => {
  try {
    const file = c.scriptArgs.positionals[0]
    const { watch } = c.scriptArgs.values as { watch: boolean }

    const buildIterator = getBuildIterator(file, watch)
    for await (const app of buildIterator) {
      const result = await executeRequest(c, app)
      if (result) {
        c.print({ message: JSON.stringify(result, null, 2) })
      }
    }
  } catch (error) {
    c.print({
      message: ['Error:', error instanceof Error ? error.message : String(error)],
      style: 'red',
      level: 'error',
    })
  }
}
