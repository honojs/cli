import * as esbuild from 'esbuild'
import type { Plugin } from 'esbuild'
import type { Hono } from 'hono'
import { CliError } from './output.js'

export interface BuildOptions {
  external?: string[]
  watch?: boolean
  sourcemap?: boolean
  plugins?: Plugin[]
}

/** App source: a file path, or code read from stdin */
export type AppEntry = string | { code: string }

const entryConfigOf = (entry: AppEntry) =>
  typeof entry === 'string'
    ? { entryPoints: [entry] }
    : {
        stdin: {
          contents: entry.code,
          resolveDir: process.cwd(),
          loader: 'tsx' as const,
          sourcefile: '__stdin__.tsx',
        },
      }

/**
 * Build and import a TypeScript/JSX/JS app from a file or from code
 */
export async function* buildAndImportApp(
  entry: AppEntry,
  options: BuildOptions = {}
): AsyncGenerator<Hono> {
  let resolveApp: (app: Hono) => void
  let rejectApp: (error: unknown) => void
  let appPromise: Promise<Hono>

  const preparePromise = () => {
    appPromise = new Promise((resolve, reject) => {
      resolveApp = resolve
      rejectApp = reject
    })
  }
  preparePromise()

  // In watch mode, a failed build logs and waits for the next change.
  // In one-shot mode it must reject, so the process exits with the
  // JSON envelope instead of hanging.
  const fail = (error: unknown) => {
    if (options.watch) {
      console.error('Error building app', error)
    } else {
      rejectApp(error)
    }
  }

  const entryConfig = entryConfigOf(entry)

  const context = await esbuild.context({
    ...entryConfig,
    sourcemap: options.sourcemap ?? false,
    sourcesContent: false,
    sourceRoot: process.cwd(),
    bundle: true,
    write: false,
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    platform: 'node',
    external: options.external || [],
    plugins: [
      {
        name: 'watch',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length > 0) {
              fail(
                new CliError('BUILD_FAILED', result.errors.map((e) => e.text).join('\n'), {
                  suggestions: ['Fix the build error in the app file'],
                })
              )
              return
            }
            try {
              // Execute the bundled code using data URL
              let code = result.outputFiles?.[0]?.text || ''
              if (options.sourcemap) {
                code += `\n//# sourceURL=file://${process.cwd()}/__hono_cli_bundle__.js`
              }
              const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
              const module = await import(dataUrl)
              const app = module.default

              if (!app || typeof app.request !== 'function') {
                throw new CliError('INVALID_APP', 'No valid Hono app exported from the file', {
                  suggestions: ['Export the Hono instance as the default export'],
                  docs: 'https://hono.dev/docs/api/hono',
                })
              }

              try {
                resolveApp(app)
              } catch {
                // Ignore
              }
            } catch (error) {
              fail(error)
            }
          })
        },
      },
      ...(options.plugins || []),
    ],
  })

  await context.watch()

  do {
    let app: Hono
    try {
      app = await appPromise!
    } catch (error) {
      // Dispose after the first build result. See issue #66.
      await context.dispose()
      throw error
    }
    if (!options.watch) {
      // `context.dispose()` must be called after first build result to avoid race condition
      // https://github.com/honojs/cli/issues/66
      await context.dispose()
    }
    yield app
    preparePromise()
  } while (options.watch)
}
