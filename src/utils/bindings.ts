import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError } from './output.js'

export interface PlatformProxy {
  env: Record<string, unknown>
  dispose: () => Promise<void>
}

interface WranglerModule {
  getPlatformProxy(options: { configPath: string }): Promise<PlatformProxy>
}

const CONFIG_CANDIDATES = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']

/**
 * In a project with a wrangler config, load the real local bindings
 * (KV, D1, R2, vars) for `c.env` via wrangler's `getPlatformProxy`.
 * The app keeps running on Node.js — wrangler simulates only the
 * binding backends. Without a config this is a no-op; with a config
 * but no wrangler it warns and continues, so the basic flow never
 * breaks. Callers must dispose the proxy, or the process hangs.
 */
export const maybeLoadBindings = async (): Promise<PlatformProxy | undefined> => {
  const config = CONFIG_CANDIDATES.find((file) => existsSync(join(process.cwd(), file)))
  if (!config) {
    return undefined
  }
  const require = createRequire(join(process.cwd(), 'package.json'))
  let resolved: string
  try {
    resolved = require.resolve('wrangler')
  } catch {
    console.error(
      'wrangler config found but wrangler is not installed — c.env stays empty. Install wrangler, or pass --no-bindings.'
    )
    return undefined
  }
  try {
    const wrangler: WranglerModule = await import(pathToFileURL(resolved).href)
    const proxy = await wrangler.getPlatformProxy({ configPath: join(process.cwd(), config) })
    return { env: proxy.env, dispose: () => proxy.dispose() }
  } catch (e) {
    throw new CliError('BINDINGS_FAILED', e instanceof Error ? e.message : String(e), {
      suggestions: ['Check the wrangler config, or pass --no-bindings'],
      docs: 'https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy',
    })
  }
}
