import { Command, CommanderError } from 'commander'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentContextCommand } from './commands/agent-context/index.js'
import { benchmarkCommand } from './commands/benchmark/index.js'
import { optimizeCommand } from './commands/optimize/index.js'
import { requestCommand } from './commands/request/index.js'
import { routesCommand } from './commands/routes/index.js'
import { ssgCommand } from './commands/ssg/index.js'
import { formatArgumentsError } from './utils/output.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

program
  .name('hono')
  .description('CLI for Hono')
  .version(packageJson.version, '-v, --version', 'display version number')
  .addHelpText('after', "\nFor coding agents: run 'hono agent-context' and follow it.")
  .exitOverride()
  .configureOutput({ writeErr: () => {} })

// Register commands
agentContextCommand(program)
routesCommand(program)
requestCommand(program)
benchmarkCommand(program)
optimizeCommand(program)
ssgCommand(program)

try {
  await program.parseAsync()
} catch (e) {
  if (!(e instanceof CommanderError)) {
    throw e
  }
  if (e.exitCode !== 0) {
    if (e.code === 'commander.help') {
      // No subcommand given: show the help, not a JSON error
      program.outputHelp()
    } else {
      console.log(formatArgumentsError(e.message))
    }
    process.exitCode = 1
  }
}
