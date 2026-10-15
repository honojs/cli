import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Framework = 'void' | 'cloudflare-workers' | 'hono'

const START = '<!-- hono-cli:start -->'
const END = '<!-- hono-cli:end -->'

const COMMON = [
  'Verify changes with Hono CLI instead of a browser or curl: `npx hono request <path>`, `npx hono batch -` for flows. Run `npx hono --help` first.',
]

const FRAMEWORK_LINES: Record<Framework, string[]> = {
  void: [
    'This is a Void app. To check pages and page actions, read the Void section of the hono skill. If the skill is missing, install it: `npx skills add honojs/skills`.',
  ],
  'cloudflare-workers': [
    '`c.env` has the local bindings (KV, D1, R2, vars). Add `--runtime workerd` to run in the real Workers runtime.',
  ],
  hono: [],
}

export const renderBlock = (framework: Framework): string =>
  [
    START,
    '## Hono CLI',
    '',
    ...[...COMMON, ...FRAMEWORK_LINES[framework]].map((line) => `- ${line}`),
    END,
  ].join('\n')

export interface WriteResult {
  file: string
  action: 'created' | 'appended' | 'updated'
}

/**
 * Write the block to AGENTS.md, or to CLAUDE.md when only that exists.
 * A block from an earlier run is replaced in place.
 */
export const writeBlock = (dir: string, framework: Framework): WriteResult => {
  const file =
    !existsSync(join(dir, 'AGENTS.md')) && existsSync(join(dir, 'CLAUDE.md'))
      ? 'CLAUDE.md'
      : 'AGENTS.md'
  const path = join(dir, file)
  const block = renderBlock(framework)
  if (!existsSync(path)) {
    writeFileSync(path, `${block}\n`)
    return { file, action: 'created' }
  }
  const content = readFileSync(path, 'utf-8')
  const start = content.indexOf(START)
  const end = content.indexOf(END, start)
  if (start !== -1 && end !== -1) {
    writeFileSync(path, content.slice(0, start) + block + content.slice(end + END.length))
    return { file, action: 'updated' }
  }
  const separator = content === '' ? '' : content.endsWith('\n') ? '\n' : '\n\n'
  writeFileSync(path, `${content}${separator}${block}\n`)
  return { file, action: 'appended' }
}
