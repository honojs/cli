import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildCommand } from '../build/index.js'
import { requestCommand } from '../request/index.js'
import { routesCommand } from '../routes/index.js'
import { agentContextCommand } from './index.js'

describe('agentContextCommand', () => {
  let program: Command
  const spyOnLog = () => vi.spyOn(console, 'log').mockImplementation(() => {})
  let consoleLogSpy: ReturnType<typeof spyOnLog>

  beforeEach(() => {
    program = new Command()
    buildCommand(program)
    requestCommand(program)
    routesCommand(program)
    agentContextCommand(program)
    consoleLogSpy = spyOnLog()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    vi.restoreAllMocks()
  })

  const getOutput = async (): Promise<string> => {
    await program.parseAsync(['node', 'hono', 'agent-context'])
    return consoleLogSpy.mock.calls[0][0]
  }

  it('should print Markdown with the output contract and workflow', async () => {
    const output = await getOutput()
    expect(output).toContain('# Hono CLI')
    expect(output).toContain('## Output contract')
    expect(output).toContain('"ok": true')
    expect(output).toContain('## Recommended workflow')
  })

  it('should document every command except itself', async () => {
    const output = await getOutput()
    expect(output).toContain('### hono build [entry]')
    expect(output).toContain('### hono request [file]')
    expect(output).toContain('### hono routes [file]')
    expect(output).not.toContain('### hono agent-context')
  })

  it('should include options from the command definitions', async () => {
    const output = await getOutput()
    expect(output).toContain('`--optimize`')
    expect(output).toContain('`-P, --path <path>`')
    expect(output).toContain('`--verbose`')
  })

  it('should include declared output shapes, error codes, and examples', async () => {
    const output = await getOutput()
    expect(output).toContain('`ENTRY_NOT_FOUND`')
    expect(output).toContain('`INVALID_APP`')
    expect(output).toContain('"router": "SmartRouter + RegExpRouter"')
    expect(output).toContain('hono build --optimize')
  })
})
