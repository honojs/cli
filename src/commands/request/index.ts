import type { TakoArgs, TakoHandler } from '@takojs/tako'
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

async function executeRequest(
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

  if (!existsSync(resolvedAppPath)) {
    throw new Error(`Entry file ${entry} does not exist`)
  }

  const appFilePath = realpathSync(resolvedAppPath)
  const app: Hono = await buildAndImportApp(appFilePath, {
    external: ['@hono/node-server'],
  })

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
    },
  },
  metadata: {
    help: 'Send request to Hono app using app.request()',
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
    },
  },
}

export const requestValidation: TakoHandler = async (_c, next) => {
  await next()
}

export const requestCommand: TakoHandler = async (c) => {
  const file = c.scriptArgs.positionals[0]
  const { path, method, data, header } = c.scriptArgs.values

  const result = await executeRequest(file, path as string, {
    method: method as string,
    data: data as string,
    header: header as string[] | undefined,
  })
  c.print({ message: JSON.stringify(result, null, 2) })
}
