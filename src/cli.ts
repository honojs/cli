import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { optimizeCommand } from './commands/optimize/index.js'
import { requestCommand } from './commands/request/index.js'

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
optimizeCommand(program)
requestCommand(program)

program.parse()
