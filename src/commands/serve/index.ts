import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { TakoArgs, TakoHandler } from '@takojs/tako'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import * as process from 'node:process'
import { buildAndImportApp } from '../../utils/build.js'
import { builtinMap } from './builtin-map.js'

// Keep serveStatic to prevent bundler removal
;[serveStatic].forEach((f) => {
  if (typeof f === 'function') {
    // useless process to avoid being deleted by bundler
  }
})

export const serveArgs: TakoArgs = {
  config: {
    options: {
      port: {
        type: 'string',
        short: 'p',
      },
      'show-routes': {
        type: 'boolean',
      },
      use: {
        type: 'string',
        multiple: true,
      },
    },
  },
  metadata: {
    help: 'Start server',
    placeholder: '[entry]',
    options: {
      port: {
        help: 'port number',
        placeholder: '<port>',
      },
      'show-routes': {
        help: 'show registered routes',
      },
      use: {
        help: 'use middleware',
        placeholder: '<middleware>',
      },
    },
  },
}

export const serveValidation: TakoHandler = async (_c, next) => {
  await next()
}

export const serveCommand: TakoHandler = async (c) => {
  const entry = c.scriptArgs.positionals[0]
  const { port, 'show-routes': showRoutesOption, use: useOptions } = c.scriptArgs.values
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
      const buildIterator = buildAndImportApp(appFilePath, {
        external: ['@hono/node-server'],
      })
      app = (await buildIterator.next()).value
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
    } catch {
      // Skip modules that can't be imported (optional dependencies)
    }
  }

  const baseApp = new Hono()
  // Apply middleware from --use options
  for (const use of (useOptions as string[] | undefined) || []) {
    // Create function with all available functions in scope
    const functionNames = Object.keys(allFunctions)
    const functionValues = Object.values(allFunctions)
    const func = new Function('c', 'next', ...functionNames, `return (${use})`)
    baseApp.use(async (c, next) => {
      const middleware = func(c, next, ...functionValues)
      return typeof middleware === 'function' ? middleware(c, next) : middleware
    })
  }

  baseApp.route('/', app)

  if (showRoutesOption) {
    showRoutes(baseApp)
  }

  serve(
    {
      fetch: baseApp.fetch,
      port: port ? Number.parseInt(port as string) : 7070,
    },
    (info) => {
      c.print({ message: `Listening on http://localhost:${info.port}` })
    }
  )
}
