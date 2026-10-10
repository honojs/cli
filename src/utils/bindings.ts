import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError } from './output.js'
import { hasViteConfig } from './vite.js'
import { CLOUDFLARE_CONFIG, findWranglerConfig, hasCloudflareConfig } from './workerd.js'

export interface PlatformProxy {
  env: Record<string, unknown>
  dispose: () => Promise<void>
}

interface WranglerModule {
  getPlatformProxy(options: { configPath: string }): Promise<PlatformProxy>
}

/**
 * In a project with a wrangler config, load the real local bindings
 * (KV, D1, R2, vars) for `c.env` via wrangler's `getPlatformProxy`.
 * The app keeps running on Node.js — wrangler simulates only the
 * binding backends. Without a config this is a no-op; with a config
 * but no wrangler, or with only `cloudflare.config.ts`, it warns and
 * continues, so the basic flow never breaks. Callers must dispose the
 * proxy, or the process hangs.
 */
export const maybeLoadBindings = async (): Promise<PlatformProxy | undefined> => {
  const config = findWranglerConfig()
  if (!config) {
    if (hasCloudflareConfig()) {
      // With a Vite config, the Cloudflare Vite plugin reads it: point there
      // instead of asking for the same bindings in a second config.
      console.error(
        hasViteConfig()
          ? `${CLOUDFLARE_CONFIG} found but it is not supported on Node.js yet — c.env stays empty. request, batch, and snapshot get the bindings with --runtime vite. Or pass --no-bindings.`
          : `${CLOUDFLARE_CONFIG} found but it is not supported yet — c.env stays empty. Add a wrangler config, or pass --no-bindings.`
      )
    }
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
