import * as esbuild from 'esbuild'
import type { Plugin } from 'esbuild'
import type { Hono } from 'hono'

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
 * Bundle the app into a single ESM string, without importing it.
 * Used to run the app in another runtime.
 */
export async function buildAppBundle(entry: AppEntry, external: string[] = []): Promise<string> {
  const result = await esbuild.build({
    ...entryConfigOf(entry),
    bundle: true,
    write: false,
    format: 'esm',
    target: 'esnext',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    platform: 'node',
    external,
  })
  return result.outputFiles[0].text
}

/**
 * Build and import a TypeScript/JSX/JS app from a file or from code
 */
export async function* buildAndImportApp(
  entry: AppEntry,
  options: BuildOptions = {}
): AsyncGenerator<Hono> {
  let resolveApp: (app: Hono) => void
  let appPromise: Promise<Hono>

  const preparePromise = () => {
    appPromise = new Promise((resolve) => {
      resolveApp = resolve
    })
  }
  preparePromise()

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
            try {
              // Execute the bundled code using data URL
              let code = result.outputFiles?.[0]?.text || ''
              if (options.sourcemap) {
                code += `\n//# sourceURL=file://${process.cwd()}/__hono_cli_bundle__.js`
              }
              const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
              const module = await import(dataUrl)
              const app = module.default

              // Determine entry file path
              if (!app) {
                throw new Error('Failed to build app')
              }

              if (!app || typeof app.request !== 'function') {
                throw new Error('No valid Hono app exported from the file')
              }

              try {
                resolveApp(app)
              } catch {
                // Ignore
              }
            } catch (error) {
              console.error('Error building app', error)
            }
          })
        },
      },
      ...(options.plugins || []),
    ],
  })

  await context.watch()

  do {
    const app = await appPromise!
    if (!options.watch) {
      // `context.dispose()` must be called after first build result to avoid race condition
      // https://github.com/honojs/cli/issues/66
      await context.dispose()
    }
    yield app
    preparePromise()
  } while (options.watch)
}
