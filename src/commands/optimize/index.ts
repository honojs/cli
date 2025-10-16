import type { Command } from 'commander'
import * as esbuild from 'esbuild'
import type { Hono } from 'hono'
import { buildInitParams, serializeInitParams } from 'hono/router/reg-exp-router'
import { execFile } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { buildAndImportApp } from '../../utils/build.js'

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']

export function optimizeCommand(program: Command) {
  program
    .command('optimize')
    .description('Build optimized Hono class')
    .argument('[entry]', 'entry file')
    .option('-o, --outfile [outfile]', 'output file', 'dist/index.js')
    .option('-m, --minify', 'minify output file')
    .action(async (entry: string, options: { outfile: string; minify?: boolean }) => {
      if (!entry) {
        entry =
          DEFAULT_ENTRY_CANDIDATES.find((entry) => existsSync(entry)) ?? DEFAULT_ENTRY_CANDIDATES[0]
      }

      const appPath = resolve(process.cwd(), entry)

      if (!existsSync(appPath)) {
        throw new Error(`Entry file ${entry} does not exist`)
      }

      const appFilePath = realpathSync(appPath)
      const app: Hono = await buildAndImportApp(appFilePath, {
        external: ['@hono/node-server'],
      })

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

      console.log('[Optimized]')
      console.log(`  Router: ${routerName}`)

      const outfile = resolve(process.cwd(), options.outfile)
      await esbuild.build({
        entryPoints: [appFilePath],
        outfile,
        bundle: true,
        minify: options.minify,
        format: 'esm',
        target: 'node20',
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
            },
          },
        ],
      })

      const outfileStat = statSync(outfile)
      console.log(`  Output: ${options.outfile} (${(outfileStat.size / 1024).toFixed(2)} KB)`)
    })
}
