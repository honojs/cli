import type { Command } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { parseHeaders } from '../../utils/headers.js'
import { getBuildIterator, readStdin } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { parseBatch, runBatch } from './batch.js'

export const agentContext: CommandAgentContext = {
  output:
    '{ "steps": [{ "method": "GET", "path": "/users", "status": 200, "body": [], "pass": true, "expect": { "status": 200 } }], "summary": { "total": 1, "passed": 1, "failed": 0 } }',
  errors: ['BATCH_INVALID', 'BATCH_NOT_FOUND', 'ENTRY_NOT_FOUND', 'BUILD_FAILED', 'INVALID_APP'],
  examples: [
    `hono batch - <<'EOF'
{"path":"/users","expect":{"status":200}}
{"method":"POST","path":"/users","body":{"name":"Momo"},"expect":{"status":201,"body":{"name":"Momo"}},"save":{"id":".id"}}
{"path":"/users/{{id}}","expect":{"status":200}}
EOF`,
  ],
  notes: [
    'Runs many requests in one call, in order, against one app instance — in-memory state carries between steps. One JSON object per line: {"method","path","body","headers","expect","save"}.',
    '"save" stores a value from the response body by dot path (e.g. {"id":".id"}), and later steps use it as {{id}}. A whole-variable string like "{{id}}" keeps the saved type.',
    'Declare the acceptance criteria in "expect": {"status":201} and/or {"body":{...}} (a deep partial match — declared fields must match, extra response fields are ignored). Turn the spec into batch lines and rerun until "failed" is 0 — comparing a spec table by eye misses lines.',
    'A shared header from -H goes to every step. Prefer a heredoc over writing a file: the lines live in your context.',
    '--compact prints only the failed steps and the summary — use it when you only need the failed: 0 loop.',
    'A failed step carries "diff": one line per mismatch (e.g. "body.name: expected \'Alice\', got \'Bob\'"). Fix what the diff names — no need to compare the bodies yourself.',
    'hono snapshot prints the current behavior of an app in this format — capture before a refactor, rerun after.',
  ],
}

interface BatchOptions {
  header?: string[]
  external?: string[]
  compact: boolean
}

export function batchCommand(program: Command) {
  program
    .command('batch')
    .description('Run multiple requests from JSONL using app.request()')
    .argument('<source>', 'JSONL file (- reads stdin)')
    .argument('[file]', 'Path to the Hono app file')
    .option(
      '-H, --header <header>',
      'Shared headers for every step',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .option('--compact', 'Print only the failed steps and the summary', false)
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      (value: string, previous: string[]) => {
        return previous ? [...previous, value] : [value]
      },
      [] as string[]
    )
    .action(
      handleErrors(async (source: string, file: string | undefined, options: BatchOptions) => {
        if (source === '-' && file === '-') {
          throw new CliError(
            'INVALID_OPTION',
            'Cannot read both the app and the batch from stdin',
            {
              suggestions: ['Pass the app as a file, or the batch as a file'],
            }
          )
        }
        const input = source === '-' ? await readStdin() : readBatchFile(source)
        const steps = parseBatch(input)
        for await (const app of getBuildIterator(file, false, options.external || [])) {
          const result = await runBatch(app, steps, parseHeaders(options.header))
          if (options.compact) {
            printResult(
              {
                steps: result.steps.filter((step) => !step.pass),
                summary: result.summary,
              },
              true
            )
          } else {
            printResult(result)
          }
        }
      })
    )
}

const readBatchFile = (source: string): string => {
  const filepath = resolve(process.cwd(), source)
  if (!existsSync(filepath)) {
    throw new CliError('BATCH_NOT_FOUND', `Batch file ${source} does not exist`, {
      suggestions: ['Pass a JSONL file, or - to read stdin'],
    })
  }
  return readFileSync(filepath, 'utf-8')
}
