import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderBlock, writeBlock } from './block.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'hono-agent-init-'))

describe('writeBlock', () => {
  it('should create AGENTS.md', () => {
    const dir = tmp()
    expect(writeBlock(dir, 'hono')).toEqual({ file: 'AGENTS.md', action: 'created' })
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toBe(`${renderBlock('hono')}\n`)
  })

  it('should append to an existing AGENTS.md', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'AGENTS.md'), '# My app')
    expect(writeBlock(dir, 'hono').action).toBe('appended')
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toBe(
      `# My app\n\n${renderBlock('hono')}\n`
    )
  })

  it('should use CLAUDE.md when only that exists', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'CLAUDE.md'), '# Notes\n')
    expect(writeBlock(dir, 'hono')).toEqual({ file: 'CLAUDE.md', action: 'appended' })
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf-8')).toContain('<!-- hono-cli:start -->')
  })

  it('should replace the block in place on a re-run', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'AGENTS.md'), '# My app\n')
    writeBlock(dir, 'hono')
    writeFileSync(
      join(dir, 'AGENTS.md'),
      `${readFileSync(join(dir, 'AGENTS.md'), 'utf-8')}\n## Other\n`
    )
    expect(writeBlock(dir, 'void').action).toBe('updated')
    const content = readFileSync(join(dir, 'AGENTS.md'), 'utf-8')
    expect(content).toBe(`# My app\n\n${renderBlock('void')}\n\n## Other\n`)
    expect(content.split('<!-- hono-cli:start -->')).toHaveLength(2)
  })
})

describe('renderBlock', () => {
  it('should add the Void lines for a Void app', () => {
    expect(renderBlock('void')).toContain('hono-void skill')
    expect(renderBlock('hono')).not.toContain('Void')
  })
})
