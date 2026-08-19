import type { Command } from 'commander'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { bullets, codeBlock, section, steps } from '../../utils/markdown.js'
import { agentContext as buildContext } from '../build/index.js'
import { agentContext as requestContext } from '../request/index.js'
import { agentContext as routesContext } from '../routes/index.js'
import { agentContext as ssgContext } from '../ssg/index.js'

const contexts: Record<string, CommandAgentContext> = {
  routes: routesContext,
  request: requestContext,
  build: buildContext,
  ssg: ssgContext,
}

const commandDoc = (command: Command, context?: CommandAgentContext): string => {
  const args = command.registeredArguments
    .map((arg) => (arg.required ? `<${arg.name()}>` : `[${arg.name()}]`))
    .join(' ')

  const optionLines = command.options.map((option) => {
    const defaultValue =
      option.defaultValue === undefined || option.defaultValue === false
        ? ''
        : ` (default: ${JSON.stringify(option.defaultValue)})`
    return `\`${option.flags}\` — ${option.description}${defaultValue}`
  })

  const errors = context?.errors ?? []
  const examples = context?.examples ?? []
  const notes = context?.notes ?? []

  return section(
    3,
    `hono ${command.name()}${args ? ` ${args}` : ''}`,
    command.description(),
    optionLines.length > 0 && 'Options:',
    optionLines.length > 0 && bullets(optionLines),
    context?.output && `Output \`data\`: \`${context.output}\``,
    errors.length > 0 && `Error codes: ${errors.map((code) => `\`${code}\``).join(', ')}`,
    examples.length > 0 && 'Examples:',
    examples.length > 0 && codeBlock('bash', examples),
    notes.length > 0 && bullets(notes)
  )
}

export const renderAgentContext = (program: Command): string =>
  section(
    1,
    'Hono CLI',
    'Hono CLI (`hono`) is a command-line tool for coding agents working on a ' +
      '[Hono](https://hono.dev) app. It loads the app directly, so you can inspect ' +
      'and test it without starting a server.',
    section(
      2,
      'Output contract',
      'Every command prints JSON to stdout:',
      bullets([
        'Success: `{ "ok": true, "data": ... }` with exit code 0',
        'Failure: `{ "ok": false, "error": { "code", "message", "suggestions", "docs" } }` with exit code 1',
      ]),
      'On failure, try `error.suggestions` in order. `error.docs` is a hono.dev page ' +
        'for the error — fetch it with the `Accept: text/markdown` header. Logs go to ' +
        'stderr. Add `--plain` when a human wants to read the output.'
    ),
    section(
      2,
      'Recommended workflow',
      steps([
        '`hono routes` — get all routes of the app without reading the source',
        '`hono request -P <path>` — send a request to the app without a server',
        'After you change the app, run them again to verify',
        '`hono build` — bundle the app (`--optimize` to reduce size)',
      ])
    ),
    section(
      2,
      'Hono documentation',
      'This document covers the CLI only. For Hono framework details, fetch ' +
        '`https://hono.dev/llms.txt` to find the right page, then fetch the page ' +
        'with the `Accept: text/markdown` header:',
      codeBlock('bash', ["curl -H 'Accept: text/markdown' https://hono.dev/docs/routing"])
    ),
    section(
      2,
      'Commands',
      ...program.commands
        .filter((command) => command.name() !== 'agent-context')
        .map((command) => commandDoc(command, contexts[command.name()]))
    )
  )
