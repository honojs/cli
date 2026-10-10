import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The templates of honojs/starter, as create-hono lists them */
export const TEMPLATES = [
  'aws-lambda',
  'bun',
  'cloudflare-workers',
  'deno',
  'fastly',
  'lambda-edge',
  'netlify',
  'nextjs',
  'nodejs',
  'vercel',
  'x-basic',
]

// A file in the project that tells which platform it targets
const SIGNALS: [file: string, template: string][] = [
  ['cloudflare.config.ts', 'cloudflare-workers'],
  ['wrangler.jsonc', 'cloudflare-workers'],
  ['wrangler.json', 'cloudflare-workers'],
  ['wrangler.toml', 'cloudflare-workers'],
  ['deno.json', 'deno'],
  ['deno.jsonc', 'deno'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['bunfig.toml', 'bun'],
  ['netlify.toml', 'netlify'],
  ['fastly.toml', 'fastly'],
  ['vercel.json', 'vercel'],
]

export const detectTemplate = (dir: string): { template: string; from: string } | undefined => {
  const found = SIGNALS.find(([file]) => existsSync(join(dir, file)))
  return found && { template: found[1], from: found[0] }
}

const LOCKFILES: [file: string, packageManager: string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
]

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun']

/**
 * The lockfile first. Without one, the package manager that started
 * the CLI (`npx`, `pnpm dlx`, ...) names itself in
 * npm_config_user_agent, e.g. "pnpm/10.0.0 node/v22.0.0".
 */
export const detectPackageManager = (dir: string, userAgent: string | undefined) => {
  const fromLockfile = LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1]
  const fromAgent = userAgent?.split('/')[0]
  return fromLockfile ?? (fromAgent && PACKAGE_MANAGERS.includes(fromAgent) ? fromAgent : 'npm')
}
