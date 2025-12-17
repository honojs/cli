import * as esbuild from 'esbuild'
import type { Plugin } from 'esbuild'
import type { Hono } from 'hono'

export interface BuildOptions {
  external?: string[]
  watch?: boolean
  sourcemap?: boolean
  plugins?: Plugin[]
}

/**
 * Build and import a TypeScript/JSX/JS file as an app
 */
export async function* buildAndImportApp(
  filePath: string,
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

  const context = await esbuild.context({
    entryPoints: [filePath],
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
  if (!options.watch) {
    await context.dispose()
  }

  do {
    yield await appPromise!
    preparePromise()
  } while (options.watch)
}
