import type * as NodeModule from 'node:module'
import { Command } from 'commander'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./browser.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BrowserModule>()),
  browse: vi.fn(async () => ({ url: '/' })),
}))
vi.mock('node:module', async (importOriginal) => {
  const original = await importOriginal<typeof NodeModule>()
  return {
    ...original,
    // The project has no happy-dom when HONO_TEST_NO_HAPPY_DOM is set
    createRequire: (path: string) => ({
      resolve: (id: string) => {
        if (process.env.HONO_TEST_NO_HAPPY_DOM) {
          throw new Error(`Cannot find module '${id}'`)
        }
        return original.createRequire(path).resolve(id)
      },
    }),
  }
})
vi.mock('../../utils/load-app.js', () => ({
  getBuildIterator: vi.fn(async function* () {
    yield new Hono()
  }),
}))

import type * as BrowserModule from './browser.js'
import { browse } from './browser.js'
import { browseCommand } from './index.js'

describe('browseCommand', () => {
  let log: ReturnType<typeof vi.spyOn>

  const run = async (...args: string[]) => {
    const program = new Command()
    browseCommand(program)
    await program.parseAsync(['node', 'test', 'browse', ...args])
    return JSON.parse(log.mock.calls[0][0] as string)
  }

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the order of --fill and --click, and splits at the first = outside []', async () => {
    await run('/', 'app.ts', '--click', '#a', '--fill', 'input[name=q]=x=1', '--click', '#b')
    expect(vi.mocked(browse).mock.calls[0][3]).toEqual([
      { type: 'click', target: '#a' },
      { type: 'fill', target: 'input[name=q]', value: 'x=1' },
      { type: 'click', target: '#b' },
    ])
  })

  it('fails with HAPPY_DOM_NOT_FOUND when the project does not have happy-dom', async () => {
    vi.stubEnv('HONO_TEST_NO_HAPPY_DOM', '1')
    const output = await run('/', 'app.ts')
    expect(output.error.code).toBe('HAPPY_DOM_NOT_FOUND')
    expect(output.error.suggestions).toEqual(['Install it: npm install -D happy-dom'])
  })
})
