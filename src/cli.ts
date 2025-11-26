import { Tako } from '@takojs/tako'
import pkg from '../package.json' with { type: 'json' }
import { docsArgs, docsCommand, docsValidation } from './commands/docs/index.js'
import { optimizeArgs, optimizeCommand, optimizeValidation } from './commands/optimize/index.js'
import { requestArgs, requestCommand, requestValidation } from './commands/request/index.js'
import { searchArgs, searchCommand, searchValidation } from './commands/search/index.js'
import { serveArgs, serveCommand, serveValidation } from './commands/serve/index.js'

const rootArgs = {
  metadata: {
    cliName: 'hono',
    version: pkg.version,
    help: pkg.description,
  },
}

const tako = new Tako()

// Register commands
tako.command('docs', docsArgs, docsValidation, docsCommand)
tako.command('optimize', optimizeArgs, optimizeValidation, optimizeCommand)
tako.command('request', requestArgs, requestValidation, requestCommand)
tako.command('search', searchArgs, searchValidation, searchCommand)
tako.command('serve', serveArgs, serveValidation, serveCommand)

await tako.cli(rootArgs)
