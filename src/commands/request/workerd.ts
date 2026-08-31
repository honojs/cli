import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError } from '../../utils/output.js'
import type { RunnerRequest } from './runtime.js'

export interface WorkerdResult {
  status: number
  headers: Record<string, string>
  body: string
  response: Response
}

interface StartedWorker {
  fetch(url: string, init?: RequestInit): Promise<Response>
  dispose(): Promise<void>
}

interface WranglerModule {
  unstable_startWorker(options: {
    config: string
    dev: { logLevel: 'error' }
  }): Promise<StartedWorker>
}

const CONFIG_CANDIDATES = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']

export const findWranglerConfig = (): string | undefined =>
  CONFIG_CANDIDATES.find((file) => existsSync(join(process.cwd(), file)))

/**
 * wrangler is not a dependency of Hono CLI. It resolves from the user's
 * project, which has it when the app targets Cloudflare.
 */
const loadWrangler = async (): Promise<WranglerModule> => {
  const require = createRequire(join(process.cwd(), 'package.json'))
  let resolved: string
  try {
    resolved = require.resolve('wrangler')
  } catch {
    throw new CliError('WRANGLER_NOT_FOUND', 'wrangler is not installed in this project', {
      suggestions: ['Install it: npm install -D wrangler'],
      docs: 'https://developers.cloudflare.com/workers/wrangler/',
    })
  }
  return import(pathToFileURL(resolved).href)
}

const TIMEOUT_MS = 10000

export const runOnWorkerd = async (request: RunnerRequest): Promise<WorkerdResult> => {
  const config = findWranglerConfig()
  if (!config) {
    throw new CliError('WRANGLER_CONFIG_NOT_FOUND', 'No wrangler config found', {
      suggestions: ['Create wrangler.jsonc with a main entry'],
      docs: 'https://developers.cloudflare.com/workers/wrangler/configuration/',
    })
  }

  const { unstable_startWorker } = await loadWrangler()
  const worker = await unstable_startWorker({ config, dev: { logLevel: 'error' } })

  let timeoutId: NodeJS.Timeout | undefined
  try {
    // When the runtime fails to start, worker.fetch() hangs and
    // dispose() rejects with the root cause. The timeout uncovers it.
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new CliError('RUNTIME_FAILED', `No response from workerd in ${TIMEOUT_MS / 1000}s`))
      }, TIMEOUT_MS)
    })
    const response = await Promise.race([
      worker.fetch(
        `http://localhost${request.path.startsWith('/') ? request.path : `/${request.path}`}`,
        {
          method: request.method,
          headers: request.headers,
          ...(request.body === undefined ? {} : { body: request.body }),
        }
      ),
      timeout,
    ])

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    const buffer = await response.clone().arrayBuffer()

    return {
      status: response.status,
      headers,
      body: new TextDecoder().decode(buffer),
      response,
    }
  } catch (error) {
    const cause = await worker.dispose().then(
      () => undefined,
      (disposeError: unknown) => disposeError
    )
    if (error instanceof CliError && cause instanceof Error) {
      throw new CliError('RUNTIME_FAILED', `The app failed on workerd: ${cause.message}`, {
        suggestions: ['Check the wrangler config and the error above'],
      })
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    await worker.dispose().catch(() => {})
  }
}
