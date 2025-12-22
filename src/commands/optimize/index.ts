import { parse } from '@babel/parser'
import type {
  ClassMethod,
  ClassProperty,
  ClassPrivateProperty,
  Identifier,
  PrivateName,
} from '@babel/types'
import type { Command } from 'commander'
import * as esbuild from 'esbuild'
import type { Hono } from 'hono'
import { METHOD_NAME_ALL } from 'hono/router'
import { buildInitParams, serializeInitParams } from 'hono/router/reg-exp-router'
import MagicString from 'magic-string'
import { execFile } from 'node:child_process'
import { existsSync, realpathSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { buildAndImportApp } from '../../utils/build.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

const HONO_REMOVAL_METHODS = ['route', 'mount', 'fire']
const REQUEST_BODY_METHODS = [
  'parseBody',
  'json',
  'text',
  'arrayBuffer',
  'blob',
  'formData',
  '#cachedBody',
]
const CONTEXT_RESPONSE_METHODS = ['body', 'json', 'text', 'html', 'redirect']

export function optimizeCommand(program: Command) {
  program
    .command('optimize')
    .description('Build optimized Hono class')
    .argument('[entry]', 'entry file')
    .option('-o, --outfile [outfile]', 'output file', 'dist/index.js')
    .option('-m, --minify', 'minify output file')
    .option(
      '--no-request-body-api-removal',
      'do not remove request body APIs even if they are not needed'
    )
    .option('--no-hono-api-removal', 'do not remove Hono APIs even if they are not used')
    .option(
      '--no-context-response-api-removal',
      'do not remove response utility APIs from Context object'
    )
    .option('-t, --target [target]', 'environment target (e.g., node24, deno2, es2024)', 'node20')
    .action(
      async (
        entry: string,
        options: {
          outfile: string
          minify?: boolean
          target: string
          requestBodyApiRemoval: boolean
          honoApiRemoval: boolean
          contextResponseApiRemoval: boolean
        }
      ) => {
        if (!entry) {
          entry =
            DEFAULT_ENTRY_CANDIDATES.find((entry) => existsSync(entry)) ??
            DEFAULT_ENTRY_CANDIDATES[0]
        }

        const appPath = resolve(process.cwd(), entry)

        if (!existsSync(appPath)) {
          throw new Error(`Entry file ${entry} does not exist`)
        }

        const unusedContextResponseMethods = new Set(
          options.contextResponseApiRemoval ? CONTEXT_RESPONSE_METHODS : []
        )
        const contextResponseMethodsRegExp = new RegExp(
          `(?<=\\.)${[...unusedContextResponseMethods].join('|')}(?=\\()`,
          'g'
        )

        const appFilePath = realpathSync(appPath)
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

        const removed = []
        const removeRequestBodyApi =
          options.requestBodyApiRemoval !== false &&
          app.routes.every(({ method }) =>
            [METHOD_NAME_ALL, 'GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
          )
        const unusedHonoMethods: Record<string, number> = (
          app as Hono & { unusedMethods: Record<string, number> }
        ).unusedMethods
        const removeHonoApi =
          options.honoApiRemoval !== false && Object.keys(unusedHonoMethods).length > 0

        console.log('[Optimized]')
        console.log(`  Router: ${routerName}`)
        if (removeRequestBodyApi) {
          removed.push('Request body APIs')
        }
        if (unusedContextResponseMethods.size !== 0) {
          removed.push(`Context response APIs (${[...unusedContextResponseMethods].join(', ')})`)
        }
        if (removeHonoApi) {
          removed.push(`Hono APIs (${Object.keys(unusedHonoMethods).join(', ')})`)
        }
        if (removed.length > 0) {
          console.log(`  Removed:\n${removed.map((r) => `    ${r}`).join('\n')}`)
        }

        const outfile = resolve(process.cwd(), options.outfile)
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
                  build.onLoad(
                    { filter: new RegExp(`/${honoPseudoImportPath}$`) },
                    async (args) => {
                      let contents = readFileSync(join(dirname(args.path), 'hono-base.js'), 'utf-8')

                      contents = removeApis(contents, 'Hono', Object.keys(unusedHonoMethods))
                      return {
                        contents,
                      }
                    }
                  )
                }
              },
            },
          ],
        })

        const outfileStat = statSync(outfile)
        console.log(`  Output: ${options.outfile} (${(outfileStat.size / 1024).toFixed(2)} KB)`)
      }
    )
}

type NodeWithRange = { start: number | null | undefined; end: number | null | undefined }
type ClassElementNode = (ClassMethod | ClassProperty | ClassPrivateProperty) & NodeWithRange

const removeApis = (contents: string, className: string, methods: string[]): string => {
  const ast = parse(contents, {
    sourceType: 'module',
    plugins: [
      'classPrivateProperties',
      'classPrivateMethods',
      'privateIn',
      'importMeta',
      'topLevelAwait',
    ],
  })

  const magic = new MagicString(contents)
  let modified = false

  for (const statement of ast.program.body as ((typeof ast.program.body)[number] &
    NodeWithRange)[]) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }

    for (const declaration of statement.declarations) {
      if (
        declaration.id.type !== 'Identifier' ||
        declaration.id.name !== className ||
        !declaration.init ||
        declaration.init.type !== 'ClassExpression'
      ) {
        continue
      }

      for (const member of declaration.init.body.body as ClassElementNode[]) {
        if (!shouldRemoveClassMember(member, methods)) {
          continue
        }
        const start = member.start ?? 0
        const end = member.end ?? start
        magic.remove(start, end)
        modified = true
      }
    }
  }

  return modified ? magic.toString() : contents
}

const shouldRemoveClassMember = (member: ClassElementNode, methods: string[]): boolean => {
  if (
    (member.type === 'ClassMethod' || member.type === 'ClassProperty') &&
    isIdentifier(member.key) &&
    methods.includes(member.key.name)
  ) {
    return true
  }

  if (
    member.type === 'ClassPrivateProperty' &&
    isPrivateIdentifier(member.key) &&
    methods.includes(`#${member.key.id.name}`)
  ) {
    return true
  }

  return false
}

const isIdentifier = (key: ClassMethod['key']): key is Identifier => key.type === 'Identifier'

const isPrivateIdentifier = (key: ClassPrivateProperty['key']): key is PrivateName =>
  key.type === 'PrivateName'
