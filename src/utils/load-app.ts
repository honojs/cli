import type { Hono } from 'hono'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAndImportApp } from './build.js'
import { CliError } from './output.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

/**
 * Resolve the entry file and return an iterator of the built app.
 */
export function getBuildIterator(
  appPath: string | undefined,
  watch: boolean,
  external: string[] = []
): AsyncGenerator<Hono> {
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
    throw new CliError('ENTRY_NOT_FOUND', `Entry file ${entry} does not exist`, {
      suggestions: [
        'Pass the app file: hono routes src/app.ts',
        'Default candidates are src/index.ts, src/index.tsx, src/index.js, and src/index.jsx',
      ],
    })
  }

  const appFilePath = realpathSync(resolvedAppPath)
  return buildAndImportApp(appFilePath, {
    external: ['@hono/node-server', ...external],
    watch,
    sourcemap: true,
  })
}
