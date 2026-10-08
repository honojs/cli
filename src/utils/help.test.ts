import { Command } from 'commander'
import { describe, it, expect } from 'vitest'
import { benchmarkCommand } from '../commands/benchmark/index.js'
import { requestCommand } from '../commands/request/index.js'
import { routesCommand } from '../commands/routes/index.js'
import { agentHelp, renderCommandHelp } from './help.js'

const createProgram = (): Command => {
  const program = new Command()
    .name('hono')
    .exitOverride()
    .configureOutput({ writeOut: (str) => (program.out += str) })
  program.out = ''
  routesCommand(program)
  requestCommand(program)
  benchmarkCommand(program)
  return program
}

const helpOf = (program: Command, args: string[]): string => {
  try {
    program.parse(['node', 'hono', ...args])
  } catch {
    // commander.helpDisplayed
  }
  return program.out
}

declare module 'commander' {
  interface Command {
    out: string
  }
}

describe('renderCommandHelp', () => {
  it('should render output, examples and notes', () => {
    const text = renderCommandHelp({
      output: '{ "a": 1 }',
      examples: ['hono x', 'hono x -y'],
      notes: ['First note.', 'Second note.'],
    })
    expect(text).toBe(`
Output data:
  { "a": 1 }

Examples:
  hono x
  hono x -y

Notes:
  - First note.
  - Second note.`)
  })

  it('should wrap long notes', () => {
    const text = renderCommandHelp({ notes: ['word '.repeat(30).trim()] })
    for (const line of text.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80)
    }
    expect(text.split('\n').length).toBeGreaterThan(2)
  })
})

describe('help text', () => {
  it('should show the agent help on the top-level help only', () => {
    const program = createProgram().addHelpText('before', agentHelp)
    const top = helpOf(program, ['--help'])
    expect(top).toContain('For coding agents:')
    expect(top).toContain('"ok": true')
    expect(top).toContain('hono <command> --help')
    expect(top).not.toContain('Examples:')
  })

  it('should show examples and notes on a command help', () => {
    const program = createProgram()
    const routes = helpOf(program, ['routes', '--help'])
    expect(routes).toContain('--verbose')
    expect(routes).toContain('"router": "SmartRouter + RegExpRouter"')
    expect(routes).toContain('hono routes --verbose src/app.ts')
    expect(routes).not.toContain('For coding agents:')
    const request = helpOf(program, ['request', '--help'])
    expect(request).toContain('hono request /api/users/123 --trace')
    const benchmark = helpOf(program, ['benchmark', '--help'])
    expect(benchmark).toContain('Run one benchmark at a time')
  })
})
