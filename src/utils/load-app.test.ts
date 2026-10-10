import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveEntry } from './load-app'

describe('resolveEntry', () => {
  const cwd = process.cwd()
  afterEach(() => {
    process.chdir(cwd)
  })

  const projectWith = (...files: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'hono-cli-entry-'))
    for (const file of files) {
      writeFileSync(join(dir, file), '')
    }
    process.chdir(dir)
  }

  it('should not name another command in the hint', async () => {
    projectWith()
    await expect(resolveEntry(undefined)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FOUND',
      suggestions: [
        'Pass the app file as the argument, e.g. src/app.ts',
        expect.stringContaining('Default candidates'),
      ],
    })
  })

  it('should point at request and batch in a Vite project', async () => {
    projectWith('vite.config.ts')
    await expect(resolveEntry(undefined)).rejects.toMatchObject({
      suggestions: expect.arrayContaining([
        expect.stringContaining('go through the Vite dev server'),
      ]),
    })
  })
})
