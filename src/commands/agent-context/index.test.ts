import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { optimizeCommand } from '../optimize/index.js'
import { requestCommand } from '../request/index.js'
import { routesCommand } from '../routes/index.js'
import { agentContextCommand } from './index.js'

describe('agentContextCommand', () => {
  let program: Command
  const spyOnLog = () => vi.spyOn(console, 'log').mockImplementation(() => {})
  let consoleLogSpy: ReturnType<typeof spyOnLog>

  beforeEach(() => {
    program = new Command()
    optimizeCommand(program)
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

  it('should delegate framework details to hono.dev', async () => {
    const output = await getOutput()
    expect(output).toContain('## Hono documentation')
    expect(output).toContain('Accept: text/markdown')
  })

  it('should document every command except itself', async () => {
    const output = await getOutput()
    expect(output).toContain('### hono optimize [entry]')
    expect(output).toContain('### hono request [path] [file]')
    expect(output).toContain('### hono routes [file]')
    expect(output).not.toContain('### hono agent-context')
  })

  it('should include options from the command definitions', async () => {
    const output = await getOutput()
    expect(output).toContain('`--request-body-api-removal <mode>`')
    expect(output).toContain('`-X, --method <method>`')
    expect(output).toContain('`--verbose`')
  })

  it('should include declared output shapes, error codes, and examples', async () => {
    const output = await getOutput()
    expect(output).toContain('`ENTRY_NOT_FOUND`')
    expect(output).toContain('`INVALID_APP`')
    expect(output).toContain('"router": "SmartRouter + RegExpRouter"')
    expect(output).toContain('hono optimize -m')
  })
})
