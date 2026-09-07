import type { Hono } from 'hono'
import { existsSync, realpathSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppEntry } from './build.js'
import { buildAndImportApp } from './build.js'
import { CliError } from './output.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

/**
 * Resolve the entry file and return an iterator of the built app.
 */
export async function* getBuildIterator(
  appPath: string | undefined,
  watch: boolean,
  external: string[] = []
): AsyncGenerator<Hono> {
  if (appPath === '-') {
    if (watch) {
      throw new CliError('INVALID_OPTION', 'Cannot watch the app read from stdin', {
        suggestions: ['Pass a file path instead of - when using --watch'],
      })
    }
    yield* buildAndImportApp(await resolveEntry(appPath), {
      external: ['@hono/node-server', ...external],
    })
    return
  }

  yield* buildAndImportApp(await resolveEntry(appPath), {
    external: ['@hono/node-server', ...external],
    watch,
    sourcemap: true,
  })
}

/**
 * Resolve the app source: `-` reads code from stdin, a path is used
 * as-is, and without a path the default candidates are tried.
 */
export async function resolveEntry(appPath: string | undefined): Promise<AppEntry> {
  if (appPath === '-') {
    return { code: wrapCode(await readStdin()) }
  }

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

  return realpathSync(resolvedAppPath)
}

export const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new CliError('MISSING_STDIN', 'No input on stdin', {
      suggestions: ['Pipe the input: hono snapshot | hono batch -'],
    })
  }
  // Not readFileSync(0): a pipe from another process can be
  // non-blocking, and the sync read fails with EAGAIN.
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/**
 * Code from stdin does not need boilerplate. If it has no default
 * export, wrap it: `app` is predefined and exported.
 */
export const wrapCode = (code: string): string => {
  if (/export\s+default/.test(code)) {
    return code
  }
  return `import { Hono } from 'hono'\nconst app = new Hono()\n${code}\nexport default app\n`
}

/**
 * Resolve a request body option: `@file` reads a file, `@-` reads
 * stdin, anything else is the body itself.
 */
export const resolveData = async (data: string | undefined): Promise<string | undefined> => {
  if (data === undefined || !data.startsWith('@')) {
    return data
  }
  if (data === '@-') {
    return await readStdin()
  }
  return readFileSync(data.slice(1), 'utf-8')
}
