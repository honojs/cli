import type { Command } from 'commander'
import { raw } from 'hono/html'
import type { FC, PropsWithChildren } from 'hono/jsx'
import type { CommandAgentContext } from '../../utils/agent-context.js'
import { agentContext as buildContext } from '../build/index.js'
import { agentContext as requestContext } from '../request/index.js'
import { agentContext as routesContext } from '../routes/index.js'

const contexts: Record<string, CommandAgentContext> = {
  routes: routesContext,
  request: requestContext,
  build: buildContext,
}

// Markdown primitives. hono/jsx is an HTML renderer, but these components
// borrow only its composition. raw() keeps the text as-is, so Markdown
// characters are never HTML-escaped.

const asArray = (children: unknown): unknown[] =>
  (Array.isArray(children) ? children : [children]).flat()

const blocks = (children: unknown): string =>
  asArray(children)
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child) => String(child).trim())
    .filter((text) => text.length > 0)
    .join('\n\n')

const Section: FC<PropsWithChildren<{ level: 1 | 2 | 3; title: string }>> = ({
  level,
  title,
  children,
}) => raw(`${'#'.repeat(level)} ${title}\n\n${blocks(children)}`)

const P: FC<PropsWithChildren> = ({ children }) => raw(asArray(children).map(String).join(''))

const Bullets: FC<{ items: string[] }> = ({ items }) =>
  raw(items.map((item) => `- ${item}`).join('\n'))

const Steps: FC<{ items: string[] }> = ({ items }) =>
  raw(items.map((item, index) => `${index + 1}. ${item}`).join('\n'))

const CodeBlock: FC<{ lang: string; lines: string[] }> = ({ lang, lines }) =>
  raw(['```' + lang, ...lines, '```'].join('\n'))

const CommandDoc: FC<{ command: Command; context?: CommandAgentContext }> = ({
  command,
  context,
}) => {
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

  return (
    <Section level={3} title={`hono ${command.name()}${args ? ` ${args}` : ''}`}>
      <P>{command.description()}</P>
      {optionLines.length > 0 ? <P>Options:</P> : null}
      {optionLines.length > 0 ? <Bullets items={optionLines} /> : null}
      {context?.output ? <P>{`Output \`data\`: \`${context.output}\``}</P> : null}
      {context?.errors?.length ? (
        <P>{`Error codes: ${context.errors.map((code) => `\`${code}\``).join(', ')}`}</P>
      ) : null}
      {context?.examples?.length ? <P>Examples:</P> : null}
      {context?.examples?.length ? <CodeBlock lang='bash' lines={context.examples} /> : null}
      {context?.notes?.length ? <Bullets items={context.notes} /> : null}
    </Section>
  )
}

const AgentContextDocument: FC<{ program: Command }> = ({ program }) => (
  <Section level={1} title='Hono CLI'>
    <P>
      Hono CLI (`hono`) is a command-line tool for coding agents working on a
      [Hono](https://hono.dev) app. It loads the app directly, so you can inspect and test it
      without starting a server.
    </P>
    <Section level={2} title='Output contract'>
      <P>Every command prints JSON to stdout:</P>
      <Bullets
        items={[
          'Success: `{ "ok": true, "data": ... }` with exit code 0',
          'Failure: `{ "ok": false, "error": { "code", "message", "hint" } }` with exit code 1',
        ]}
      />
      <P>
        Follow `error.hint` when a command fails. Logs go to stderr. Add `--plain` when a human
        wants to read the output.
      </P>
    </Section>
    <Section level={2} title='Recommended workflow'>
      <Steps
        items={[
          '`hono routes` — get all routes of the app without reading the source',
          '`hono request -P <path>` — send a request to the app without a server',
          'After you change the app, run them again to verify',
          '`hono build` — bundle the app (`--optimize` to reduce size)',
        ]}
      />
    </Section>
    <Section level={2} title='Commands'>
      {program.commands
        .filter((command) => command.name() !== 'agent-context')
        .map((command) => (
          <CommandDoc command={command} context={contexts[command.name()]} />
        ))}
    </Section>
  </Section>
)

export const renderAgentContext = (program: Command): string =>
  String(<AgentContextDocument program={program} />)
