import type { Command } from 'commander'
import { spawn } from 'node:child_process'
import type { CommandHelp } from '../../utils/help.js'
import { renderCommandHelp } from '../../utils/help.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { compareSnapshots, parseLines } from './compare.js'
import { addWorktree, commitWorkingTree, resolveBase } from './worktree.js'

const help: CommandHelp = {
  output:
    '{ "base": "HEAD", "compared": 6, "changed": [{ "route": "GET /api/posts", "status": "200 -> 401" }], "added": ["POST /login"], "removed": [] }',
  examples: ['hono diff', 'hono diff --base main'],
  notes: [
    'Shows what your uncommitted changes do to the app: it runs the app at the last commit and as it is now, and compares the answers. Nothing to capture first.',
    'Paramless GET routes and a 404 probe are run on both sides; "changed" lists each one that answers differently, with the status and body differences. Routes that appear or disappear are in "added" and "removed".',
    'Param and non-GET routes are not run — check them with hono batch.',
    'Each side runs in a temporary git worktree with fresh local data, so data you wrote while testing does not count. node_modules is shared, and .dev.vars is copied.',
    'Empty "changed" after a refactor means the GET routes answer as before.',
  ],
}

interface DiffOptions {
  base: string
}

/** Run `hono snapshot` in a directory with this same CLI */
const snapshot = (dir: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1], 'snapshot'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk))
    child.on('error', reject)
    child.on('close', () => {
      // A failed snapshot prints the JSON error envelope instead of lines
      const failed = out.startsWith('{"ok":false') || out.startsWith('{\n  "ok": false')
      if (failed || out.trim() === '') {
        let message = err.trim().split('\n').slice(-3).join(' ')
        try {
          message = (JSON.parse(out) as { error: { message: string } }).error.message
        } catch {
          // keep stderr
        }
        reject(new Error(message || 'no output'))
      } else {
        resolve(out)
      }
    })
  })

export function diffCommand(program: Command) {
  program
    .command('diff')
    .addHelpText('after', renderCommandHelp(help))
    .description('Show how your uncommitted changes change what the app answers')
    .option('--base <ref>', 'commit to compare with', 'HEAD')
    .action(
      handleErrors(async (options: DiffOptions) => {
        const cwd = process.cwd()
        const base = resolveBase(cwd, options.base)
        const current = commitWorkingTree(cwd)
        const trees = [addWorktree(cwd, base), addWorktree(cwd, current)]
        try {
          // One after the other: both sides share node_modules, and two
          // Vite servers rebuilding its dependency cache at once can stall
          const outputs: string[] = []
          for (const [i, tree] of trees.entries()) {
            outputs.push(
              await snapshot(tree.dir).catch((error: Error) => {
                throw new CliError(
                  'SNAPSHOT_FAILED',
                  `Could not run the app ${i === 0 ? `at ${options.base}` : 'as it is now'}: ${error.message}`,
                  { suggestions: ['Run hono snapshot to see the error'] }
                )
              })
            )
          }
          const [before, after] = outputs
          printResult({
            base: options.base,
            ...compareSnapshots(parseLines(before), parseLines(after)),
          })
        } finally {
          for (const tree of trees) {
            tree.remove()
          }
        }
      })
    )
}
