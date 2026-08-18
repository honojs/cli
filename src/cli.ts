import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentContextCommand } from './commands/agent-context/index.js'
import { buildCommand } from './commands/build/index.js'
import { requestCommand } from './commands/request/index.js'
import { routesCommand } from './commands/routes/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

program
  .name('hono')
  .description('CLI for Hono')
  .version(packageJson.version, '-v, --version', 'display version number')

// Register commands
buildCommand(program)
requestCommand(program)
routesCommand(program)
agentContextCommand(program)

program.parse()
