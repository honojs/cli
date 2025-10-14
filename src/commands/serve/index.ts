import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Command } from 'commander'
import * as esbuild from 'esbuild'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { existsSync, realpathSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { builtinMap } from './builtin-map.js'

// Keep serveStatic to prevent bundler removal
;[serveStatic].forEach((f) => {
  if (typeof f === 'function') {
    // useless process to avoid being deleted by bundler
  }
})

export function serveCommand(program: Command) {
  program
    .command('serve')
    .description('Start server')
    .argument('[entry]', 'entry file')
    .option('-p, --port <port>', 'port number')
    .option('--show-routes', 'show registered routes')
    .option(
      '--use <middleware>',
      'use middleware',
      (value, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      []
    )
    .action(
      async (
        entry: string | undefined,
        options: { port?: string; showRoutes?: boolean; use?: string[] }
      ) => {
        let app: Hono

        if (!entry) {
          // Create a default Hono app if no entry is provided
          app = new Hono()
        } else {
          const appPath = resolve(process.cwd(), entry)

          if (!existsSync(appPath)) {
            // Create a default Hono app if entry file doesn't exist
            app = new Hono()
          } else {
            const appFilePath = realpathSync(appPath)
            const ext = extname(appFilePath)

            // TypeScript/JSX files need transformation and bundling
            if (['.ts', '.tsx', '.jsx'].includes(ext)) {
              // Use build API to resolve imports and bundle
              const result = await esbuild.build({
                entryPoints: [appFilePath],
                bundle: true,
                write: false,
                format: 'esm',
                target: 'node20',
                jsx: 'automatic',
                jsxImportSource: 'hono/jsx',
                platform: 'node',
                external: ['@hono/node-server'], // Keep server external
                sourcemap: 'inline',
              })

              // Execute the bundled code using data URL
              const code = result.outputFiles[0].text
              const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
              const module = await import(dataUrl)
              app = module.default
            } else {
              // Regular JS files can be imported directly
              const module = await import(pathToFileURL(appFilePath).href)
              app = module.default
            }
          }
        }

        // Import all builtin functions from the builtin map
        const allFunctions: Record<string, any> = {}
        const uniqueModules = [...new Set(Object.values(builtinMap))]

        for (const modulePath of uniqueModules) {
          try {
            const module = await import(modulePath)
            // Add all exported functions from this module
            for (const [funcName, modulePathInMap] of Object.entries(builtinMap)) {
              if (modulePathInMap === modulePath && module[funcName]) {
                allFunctions[funcName] = module[funcName]
              }
            }
          } catch (error) {
            // Skip modules that can't be imported (optional dependencies)
          }
        }

        const baseApp = new Hono()
        // Apply middleware from --use options
        for (const use of options.use || []) {
          baseApp.use(async (c, next) => {
            // Create function with all available functions in scope
            const functionNames = Object.keys(allFunctions)
            const functionValues = Object.values(allFunctions)

            const func = new Function('c', 'next', ...functionNames, `return (${use})`)
            const middleware = func(c, next, ...functionValues)
            return typeof middleware === 'function' ? middleware(c, next) : middleware
          })
        }

        baseApp.route('/', app)

        if (options.showRoutes) {
          showRoutes(baseApp)
        }

        serve(
          {
            fetch: baseApp.fetch,
            port: options.port ? Number.parseInt(options.port) : 7070,
          },
          (info) => {
            console.log(`Listening on http://localhost:${info.port}`)
          }
        )
      }
    )
}
