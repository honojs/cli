import type { Command } from 'commander'
import * as esbuild from 'esbuild'
import type { Hono } from 'hono'
import { buildInitParams, serializeInitParams } from 'hono/router/reg-exp-router'
import { execFile } from 'node:child_process'
import { existsSync, realpathSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { buildAndImportApp } from '../../utils/build.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { removeApis } from './remove-apis.js'

export const agentContext: CommandAgentContext = {
  output:
    '{ "optimized": true, "router": "PreparedRegExpRouter", "removed": { "requestBodyApis": true, "contextResponseApis": ["html"], "honoApis": ["route"] }, "output": "dist/index.js", "size": 34124 }',
  errors: ['ENTRY_NOT_FOUND', 'INVALID_OPTION'],
  examples: ['hono build', 'hono build --optimize', 'hono build --optimize -m -o dist/app.js'],
  notes: [
    'Without --optimize it just bundles the app.',
    'With --optimize, request body APIs are removed only when every route method is strictly GET/HEAD/OPTIONS. If you have checked the app never reads request bodies, pass --request-body-api-removal force.',
  ],
}

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

const HONO_REMOVAL_METHODS = ['route', 'mount', 'fire']
const REQUEST_BODY_METHODS = [
  'parseBody',
  'json',
  'text',
  'arrayBuffer',
  'bytes',
  'blob',
  'formData',
  '#cachedBody',
]
const CONTEXT_RESPONSE_METHODS = ['body', 'json', 'text', 'html', 'redirect']

interface BuildOptions {
  outfile: string
  minify?: boolean
  target: string
  optimize?: boolean
  requestBodyApiRemoval: 'auto' | 'force' | 'disable'
  honoApiRemoval: boolean
  contextResponseApiRemoval: boolean
  plain?: boolean
}

interface BuildResult {
  optimized: boolean
  router?: string
  removed?: {
    requestBodyApis: boolean
    contextResponseApis: string[]
    honoApis: string[]
  }
  output: string
  size: number
}

export function buildCommand(program: Command) {
  program
    .command('build')
    .description('Build your Hono app')
    .argument('[entry]', 'entry file')
    .option('-o, --outfile [outfile]', 'output file', 'dist/index.js')
    .option('-m, --minify', 'minify output file')
    .option('--optimize', 'apply Hono-specific optimizations')
    .option(
      '--request-body-api-removal <mode>',
      'request body API removal mode (auto | force | disable)',
      'auto'
    )
    .option('--no-hono-api-removal', 'do not remove Hono APIs even if they are not used')
    .option(
      '--no-context-response-api-removal',
      'do not remove response utility APIs from Context object'
    )
    .option('-t, --target [target]', 'environment target (e.g., node24, deno2, es2024)', 'node20')
    .option('--plain', 'human-readable output instead of JSON')
    .action(
      handleErrors(async (entry: string, options: BuildOptions) => {
        if (!['auto', 'force', 'disable'].includes(options.requestBodyApiRemoval)) {
          throw new CliError(
            'INVALID_OPTION',
            `Invalid mode for --request-body-api-removal: ${options.requestBodyApiRemoval}`,
            { suggestions: ['Use one of: auto, force, disable'] }
          )
        }
        if (!entry) {
          entry =
            DEFAULT_ENTRY_CANDIDATES.find((entry) => existsSync(entry)) ??
            DEFAULT_ENTRY_CANDIDATES[0]
        }

        const appPath = resolve(process.cwd(), entry)

        if (!existsSync(appPath)) {
          throw new CliError('ENTRY_NOT_FOUND', `Entry file ${entry} does not exist`, {
            suggestions: [
              'Pass the entry file: hono build src/app.ts',
              'Default candidates are src/index.ts, src/index.tsx, src/index.js, and src/index.jsx',
            ],
          })
        }

        const appFilePath = realpathSync(appPath)
        const outfile = resolve(process.cwd(), options.outfile)

        const result = options.optimize
          ? await buildOptimized(appFilePath, outfile, options)
          : await buildPlain(appFilePath, outfile, options)
        result.size = statSync(outfile).size

        if (options.plain) {
          console.log(formatPlainResult(result))
        } else {
          printResult(result)
        }
      })
    )
}

const formatPlainResult = (result: BuildResult): string => {
  const lines = ['[Build]']
  if (result.router) {
    lines.push(`  Router: ${result.router}`)
  }
  if (result.removed) {
    const removed = []
    if (result.removed.requestBodyApis) {
      removed.push('Request body APIs')
    }
    if (result.removed.contextResponseApis.length > 0) {
      removed.push(`Context response APIs (${result.removed.contextResponseApis.join(', ')})`)
    }
    if (result.removed.honoApis.length > 0) {
      removed.push(`Hono APIs (${result.removed.honoApis.join(', ')})`)
    }
    if (removed.length > 0) {
      lines.push(`  Removed:\n${removed.map((r) => `    ${r}`).join('\n')}`)
    }
  }
  lines.push(`  Output: ${result.output} (${(result.size / 1024).toFixed(2)} KB)`)
  return lines.join('\n')
}

const buildPlain = async (
  appFilePath: string,
  outfile: string,
  options: BuildOptions
): Promise<BuildResult> => {
  await esbuild.build({
    entryPoints: [appFilePath],
    outfile,
    bundle: true,
    minify: options.minify,
    format: 'esm',
    target: options.target,
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
  })
  return { optimized: false, output: options.outfile, size: 0 }
}

const buildOptimized = async (
  appFilePath: string,
  outfile: string,
  options: BuildOptions
): Promise<BuildResult> => {
  const unusedContextResponseMethods = new Set(
    options.contextResponseApiRemoval ? CONTEXT_RESPONSE_METHODS : []
  )
  const contextResponseMethodsRegExp = new RegExp(
    `(?<=\\.)${[...unusedContextResponseMethods].join('|')}(?=\\()`,
    'g'
  )

  const buildIterator = buildAndImportApp(appFilePath, {
    external: ['@hono/node-server'],
    plugins: [
      {
        name: 'hono-optimize',
        setup(build) {
          const honoPseudoImportPath = 'hono-optimized-pseudo-import-path'

          build.onResolve({ filter: /^hono$/ }, async (args) => {
            if (!args.importer) {
              // prevent recursive resolution of "hono"
              return undefined
            }

            // resolve original import path for "hono"
            const resolved = await build.resolve(args.path, {
              kind: 'import-statement',
              resolveDir: args.resolveDir,
            })

            // mark "honoOptimize" to the resolved path for filtering
            return {
              path: join(dirname(resolved.path), honoPseudoImportPath),
            }
          })
          build.onLoad({ filter: new RegExp(`/${honoPseudoImportPath}$`) }, async () => {
            return {
              contents: `
import { HonoBase } from 'hono/hono-base'
import { TrieRouter } from 'hono/router/trie-router'

export class Hono extends HonoBase {
  constructor(options = {}) {
    super(options)
    this.router = options.router ?? new TrieRouter()
  }

  unusedMethods = ${JSON.stringify(
    HONO_REMOVAL_METHODS.reduce(
      (acc, method) => {
        acc[method] = 1
        return acc
      },
      {} as Record<string, number>
    )
  )}
  ${HONO_REMOVAL_METHODS.map(
    (method) => `get ${method}() {
    delete this.unusedMethods["${method}"]
    return super.${method}
  }`
  ).join('\n')}
}
`,
            }
          })

          build.onLoad({ filter: /\.(?:jsx?|tsx?)/ }, async ({ path }) => {
            if (!path.match(/node_modules(\/|\\)hono(\/|\\)dist/)) {
              ;(readFileSync(path, 'utf8').match(contextResponseMethodsRegExp) || []).forEach(
                (m) => {
                  unusedContextResponseMethods.delete(m)
                }
              )
            }
            return undefined
          })
        },
      },
    ],
  })
  const app: Hono = (await buildIterator.next()).value

  let routerName
  let importStatement
  let assignRouterStatement
  try {
    const serialized = serializeInitParams(
      buildInitParams({
        paths: app.routes.map(({ path }) => path),
      })
    )

    const hasPreparedRegExpRouter = await new Promise<boolean>((resolve) => {
      const child = execFile(process.execPath, [
        '--input-type=module',
        '-e',
        "try { (await import('hono/router/reg-exp-router')).PreparedRegExpRouter && process.exit(0) } finally { process.exit(1) }",
      ])
      child.on('exit', (code) => {
        resolve(code === 0)
      })
    })

    if (hasPreparedRegExpRouter) {
      routerName = 'PreparedRegExpRouter'
      importStatement = "import { PreparedRegExpRouter } from 'hono/router/reg-exp-router'"
      assignRouterStatement = `const routerParams = ${serialized}
    this.router = new PreparedRegExpRouter(...routerParams)`
    } else {
      routerName = 'RegExpRouter'
      importStatement = "import { RegExpRouter } from 'hono/router/reg-exp-router'"
      assignRouterStatement = 'this.router = new RegExpRouter()'
    }
  } catch {
    // fallback to default router
    routerName = 'TrieRouter'
    importStatement = "import { TrieRouter } from 'hono/router/trie-router'"
    assignRouterStatement = 'this.router = new TrieRouter()'
  }

  // "auto" removes the APIs only when every route method is strictly
  // GET/HEAD/OPTIONS. A route or middleware registered with ALL may read
  // the request body (#64), so its presence keeps the APIs.
  const removeRequestBodyApi =
    options.requestBodyApiRemoval === 'force' ||
    (options.requestBodyApiRemoval === 'auto' &&
      app.routes.every(({ method }) => ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())))
  const unusedHonoMethods: Record<string, number> = (
    app as Hono & { unusedMethods: Record<string, number> }
  ).unusedMethods
  const removeHonoApi =
    options.honoApiRemoval !== false && Object.keys(unusedHonoMethods).length > 0

  await esbuild.build({
    entryPoints: [appFilePath],
    outfile,
    bundle: true,
    minify: options.minify,
    format: 'esm',
    target: options.target,
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    plugins: [
      {
        name: 'hono-optimize',
        setup(build) {
          const honoPseudoImportPath = 'hono-optimized-pseudo-import-path'

          build.onResolve({ filter: /^hono$/ }, async (args) => {
            if (!args.importer) {
              // prevent recursive resolution of "hono"
              return undefined
            }

            // resolve original import path for "hono"
            const resolved = await build.resolve(args.path, {
              kind: 'import-statement',
              resolveDir: args.resolveDir,
            })

            // mark "honoOptimize" to the resolved path for filtering
            return {
              path: join(dirname(resolved.path), honoPseudoImportPath),
            }
          })
          build.onLoad({ filter: new RegExp(`/${honoPseudoImportPath}$`) }, async () => {
            return {
              contents: `
import { HonoBase } from 'hono/hono-base'
${importStatement}
export class Hono extends HonoBase {
  constructor(options = {}) {
    super(options)
    ${assignRouterStatement}
  }
}
`,
            }
          })

          if (removeRequestBodyApi) {
            const honoRequestPseudoImportPath = 'hono-optimized-request-pseudo-import-path'
            build.onResolve({ filter: /request\.js$/ }, async (args) => {
              if (!args.importer) {
                return undefined
              }

              // resolve original import path for "request"
              const resolved = await build.resolve(args.path, {
                kind: 'import-statement',
                resolveDir: args.resolveDir,
              })

              // mark "honoOptimize" to the resolved path for filtering
              return {
                path: join(dirname(resolved.path), honoRequestPseudoImportPath),
              }
            })
            build.onLoad(
              { filter: new RegExp(`/${honoRequestPseudoImportPath}$`) },
              async (args) => {
                let contents = readFileSync(join(dirname(args.path), 'request.js'), 'utf-8')

                contents = removeApis(contents, 'HonoRequest', REQUEST_BODY_METHODS)
                return {
                  contents,
                }
              }
            )
          }

          if (options.contextResponseApiRemoval) {
            const honoRequestPseudoImportPath = 'hono-optimized-context-pseudo-import-path'
            build.onResolve({ filter: /context\.js$/ }, async (args) => {
              if (!args.importer) {
                return undefined
              }

              // resolve original import path for "context"
              const resolved = await build.resolve(args.path, {
                kind: 'import-statement',
                resolveDir: args.resolveDir,
              })

              // mark "honoOptimize" to the resolved path for filtering
              return {
                path: join(dirname(resolved.path), honoRequestPseudoImportPath),
              }
            })
            build.onLoad(
              { filter: new RegExp(`/${honoRequestPseudoImportPath}$`) },
              async (args) => {
                let contents = readFileSync(join(dirname(args.path), 'context.js'), 'utf-8')

                contents = removeApis(contents, 'Context', [...unusedContextResponseMethods])
                return {
                  contents,
                }
              }
            )
          }

          if (removeHonoApi) {
            const honoPseudoImportPath = 'hono-base-optimized-pseudo-import-path'
            build.onResolve({ filter: /hono-base\.js$|^hono\/hono-base$/ }, async (args) => {
              if (!args.importer) {
                return undefined
              }

              // resolve original import path for "context"
              const resolved = await build.resolve(args.path, {
                kind: 'import-statement',
                resolveDir: args.resolveDir,
              })

              // mark "honoOptimize" to the resolved path for filtering
              return {
                path: join(dirname(resolved.path), honoPseudoImportPath),
              }
            })
            build.onLoad({ filter: new RegExp(`/${honoPseudoImportPath}$`) }, async (args) => {
              let contents = readFileSync(join(dirname(args.path), 'hono-base.js'), 'utf-8')

              contents = removeApis(contents, 'Hono', Object.keys(unusedHonoMethods))
              return {
                contents,
              }
            })
          }
        },
      },
    ],
  })

  return {
    optimized: true,
    router: routerName,
    removed: {
      requestBodyApis: removeRequestBodyApi,
      contextResponseApis: [...unusedContextResponseMethods],
      honoApis: removeHonoApi ? Object.keys(unusedHonoMethods) : [],
    },
    output: options.outfile,
    size: 0,
  }
}
