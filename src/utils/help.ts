/**
 * Extra help a command shows after its options. Written for coding agents,
 * kept next to the command so it stays correct.
 */
export interface CommandHelp {
  /** Shape of `data` in the JSON output, as a compact sample */
  output?: string
  /** Usage examples, one command line each */
  examples?: string[]
  /** Extra notes */
  notes?: string[]
}

const indent = (text: string, prefix = '  '): string =>
  text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')

const wrap = (text: string, width: number): string => {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  return [...lines, line].join('\n')
}

export const renderCommandHelp = (help: CommandHelp): string => {
  const sections: string[] = []
  if (help.output) {
    sections.push(`Output data:\n${indent(wrap(help.output, 78))}`)
  }
  if (help.examples?.length) {
    sections.push(`Examples:\n${help.examples.map((example) => indent(example)).join('\n')}`)
  }
  if (help.notes?.length) {
    sections.push(
      `Notes:\n${help.notes.map((note) => `  - ${indent(wrap(note, 76), '    ').trimStart()}`).join('\n')}`
    )
  }
  return `\n${sections.join('\n\n')}`
}

export const agentHelp = `For coding agents:
  Every command prints JSON to stdout: { "ok": true, "data": ... } on success,
  { "ok": false, "error": { "code", "message", "suggestions", "docs" } } on
  failure. Try the suggestions in order. Logs go to stderr.
  To learn an app you did not write, start with \`hono routes\`. To check a
  change, use \`hono request <path>\`: it shows what the app does. For several
  requests or a flow (POST, then GET), send them in one \`hono batch -\` call,
  not many \`hono request\` calls: it is one start, and in a Vite project each
  request starts the dev server again.
  Before changing existing routes, capture them with
  \`hono snapshot --status-only\`. After the change, pipe those lines, plus
  lines for new routes, into \`hono batch - --compact\` until "failed" is 0.
  \`hono <command> --help\` has examples and notes.
  For Hono itself, fetch https://hono.dev/llms.txt to find the page, then fetch
  it with the \`Accept: text/markdown\` header.
`
