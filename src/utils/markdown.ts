// Small helpers to build a Markdown document. A block is a string;
// false/null/undefined blocks are skipped, so conditional blocks can be
// written inline.

export type Block = string | false | null | undefined

const joinBlocks = (blocks: Block[]): string =>
  blocks
    .filter((block): block is string => typeof block === 'string')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join('\n\n')

export const section = (level: 1 | 2 | 3, title: string, ...blocks: Block[]): string =>
  `${'#'.repeat(level)} ${title}\n\n${joinBlocks(blocks)}`

export const bullets = (items: string[]): string => items.map((item) => `- ${item}`).join('\n')

export const steps = (items: string[]): string =>
  items.map((item, index) => `${index + 1}. ${item}`).join('\n')

export const codeBlock = (lang: string, lines: string[]): string =>
  ['```' + lang, ...lines, '```'].join('\n')
