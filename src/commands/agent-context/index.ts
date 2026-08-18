import type { Command } from 'commander'
import { renderAgentContext } from './document.js'

export function agentContextCommand(program: Command) {
  program
    .command('agent-context')
    .description('Show how to use Hono CLI, for coding agents')
    .action(async () => {
      console.log(renderAgentContext(program))
    })
}
