import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { logsToStderr } from './app-logs.js'
import { CliError } from './output.js'
import type { RequestTarget } from './target.js'

interface ViteLogger {
  info(msg: string): void
  warn(msg: string): void
  warnOnce(msg: string): void
  error(msg: string): void
}

interface ViteDevServer {
  middlewares: (req: IncomingMessage, res: ServerResponse) => void
  close(): Promise<void>
}

interface ViteModule {
  createLogger(level: 'info'): ViteLogger
  createServer(config: {
    server: { middlewareMode: true; hmr: false; ws: false }
    appType: 'custom'
    customLogger: ViteLogger
  }): Promise<ViteDevServer>
}

/**
 * A Vite dev server of the project. `request` sends one request and
 * keeps the server up, so many steps share one start. Callers must
 * `dispose`.
 */
export interface ViteTarget extends RequestTarget {
  request(input: Request): Promise<Response>
  dispose(): Promise<void>
}

export const VITE_NOTE =
  '--runtime vite sends the requests through the Vite dev server of the project — for an app that a Vite plugin builds. The app comes from the Vite config, so pass no file argument. It is the default in a project with cloudflare.config.ts and a Vite config, where c.env gets the bindings, and in a Vite project with no src/index.ts.'

const VITE_CONFIGS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((ext) => `vite.config.${ext}`)

export const hasViteConfig = (): boolean =>
  VITE_CONFIGS.some((file) => existsSync(join(process.cwd(), file)))

/**
 * vite is not a dependency of Hono CLI. It resolves from the user's
 * project, like wrangler.
 */
const loadVite = async (): Promise<ViteModule> => {
  const require = createRequire(join(process.cwd(), 'package.json'))
  let resolved: string
  try {
    resolved = require.resolve('vite')
  } catch {
    throw new CliError('VITE_NOT_FOUND', 'vite is not installed in this project', {
      suggestions: ['Install it: npm install -D vite', 'Or drop --runtime vite'],
      docs: 'https://vite.dev/guide/',
    })
  }
  return import(pathToFileURL(resolved).href)
}

/**
 * Start the Vite dev server from the project's Vite config, so an app
 * that a Vite plugin builds (with virtual modules) can take requests.
 * The server listens on a random port on 127.0.0.1 only.
 */
export const startVite = async (): Promise<ViteTarget> => {
  const { createLogger, createServer: createViteServer } = await loadVite()
  // Keep the app logs off stdout, which is for the JSON output. An app
  // in workerd logs through this logger; an app in this process (e.g.
  // @hono/vite-dev-server) calls console.log, so `request` wraps it.
  const toStderr = (msg: string) => console.error(msg)
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    customLogger: {
      ...createLogger('info'),
      info: toStderr,
      warn: toStderr,
      warnOnce: toStderr,
      error: toStderr,
    },
  })
  const server = createServer(vite.middlewares)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    async request(input: Request) {
      const { pathname, search } = new URL(input.url)
      const hasBody = input.method !== 'GET' && input.method !== 'HEAD'
      const body = hasBody ? await input.arrayBuffer() : undefined
      const res = await logsToStderr(() =>
        fetch(`http://127.0.0.1:${port}${pathname}${search}`, {
          method: input.method,
          headers: input.headers,
          // Like app.request(): return a redirect as-is
          redirect: 'manual',
          body,
        })
      )
      // These come from the local HTTP hop, not from the app
      const headers = new Headers(res.headers)
      headers.delete('connection')
      headers.delete('keep-alive')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    },
    async dispose() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await vite.close()
    },
  }
}
