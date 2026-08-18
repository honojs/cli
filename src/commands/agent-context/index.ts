import type { Command } from 'commander'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { agentContext as buildContext } from '../build/index.js'
import { agentContext as requestContext } from '../request/index.js'
import { agentContext as routesContext } from '../routes/index.js'

const contexts: Record<string, CommandAgentContext> = {
  routes: routesContext,
  request: requestContext,
  build: buildContext,
}

const INTRO = `# Hono CLI

Hono CLI (\`hono\`) is a command-line tool for coding agents working on a
[Hono](https://hono.dev) app. It loads the app directly, so you can
inspect and test it without starting a server.

## Output contract

Every command prints JSON to stdout:

- Success: \`{ "ok": true, "data": ... }\` with exit code 0
- Failure: \`{ "ok": false, "error": { "code", "message", "hint" } }\` with exit code 1

Follow \`error.hint\` when a command fails. Logs go to stderr. Add
\`--plain\` when a human wants to read the output.

## Recommended workflow

1. \`hono routes\` — get all routes of the app without reading the source
2. \`hono request -P <path>\` — send a request to the app without a server
3. After you change the app, run them again to verify
4. \`hono build\` — bundle the app (\`--optimize\` to reduce size)`

export function agentContextCommand(program: Command) {
  program
    .command('agent-context')
    .description('Show how to use Hono CLI, for coding agents')
    .action(async () => {
      console.log(renderAgentContext(program))
    })
}

export const renderAgentContext = (program: Command): string => {
  const sections: string[] = [INTRO, '## Commands']

  for (const command of program.commands) {
    const name = command.name()
    if (name === 'agent-context') {
      continue
    }

    const args = command.registeredArguments
      .map((arg) => (arg.required ? `<${arg.name()}>` : `[${arg.name()}]`))
      .join(' ')
    const lines: string[] = []
    lines.push(`### hono ${name}${args ? ` ${args}` : ''}`)
    lines.push('')
    lines.push(command.description())

    if (command.options.length > 0) {
      lines.push('')
      lines.push('Options:')
      lines.push('')
      for (const option of command.options) {
        const defaultValue =
          option.defaultValue === undefined || option.defaultValue === false
            ? ''
            : ` (default: ${JSON.stringify(option.defaultValue)})`
        lines.push(`- \`${option.flags}\` — ${option.description}${defaultValue}`)
      }
    }

    const context = contexts[name]
    if (context?.output) {
      lines.push('')
      lines.push(`Output \`data\`: \`${context.output}\``)
    }
    if (context?.errors && context.errors.length > 0) {
      lines.push('')
      lines.push(`Error codes: ${context.errors.map((e) => `\`${e}\``).join(', ')}`)
    }
    if (context?.examples && context.examples.length > 0) {
      lines.push('')
      lines.push('Examples:')
      lines.push('')
      lines.push('```bash')
      lines.push(...context.examples)
      lines.push('```')
    }
    if (context?.notes && context.notes.length > 0) {
      lines.push('')
      lines.push(...context.notes.map((note) => `- ${note}`))
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}
