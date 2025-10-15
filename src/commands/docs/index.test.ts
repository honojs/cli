import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch
global.fetch = vi.fn()

import { docsCommand } from './index.js'

describe('docsCommand', () => {
  let program: Command
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    program = new Command()
    docsCommand(program)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Save original isTTY and set to true for tests by default
    originalIsTTY = process.stdin.isTTY
    process.stdin.isTTY = true

    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()

    // Restore original isTTY
    if (originalIsTTY !== undefined) {
      process.stdin.isTTY = originalIsTTY
    } else {
      delete (process.stdin as any).isTTY
    }
  })

  it('should fetch and display llms.txt when no path provided', async () => {
    const mockContent =
      'Hono - Web framework built on Web Standards\n\nHono is a small, simple, and ultrafast web framework.'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockContent),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(fetch).toHaveBeenCalledWith('https://hono.dev/llms.txt')
    expect(consoleLogSpy).toHaveBeenCalledWith('Fetching Hono documentation...')
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockContent)
  })

  it('should handle paths starting with /docs/', async () => {
    const mockMarkdown = '# Stacks\n\nThis is about Hono stacks.'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs', '/docs/concepts/stacks'])

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/honojs/website/refs/heads/main/docs/concepts/stacks.md'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Fetching Hono documentation for /docs/concepts/stacks...'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockMarkdown)
  })

  it('should handle paths without /docs/ prefix (from root)', async () => {
    const mockMarkdown = '# Example\n\nThis is an example.'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs', '/examples/stytch-auth'])

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/honojs/website/refs/heads/main/examples/stytch-auth.md'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Fetching Hono documentation for /examples/stytch-auth...'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockMarkdown)
  })

  it('should normalize paths without leading slash', async () => {
    const mockMarkdown = '# Example\n\nThis is an example.'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs', 'examples/basic'])

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/honojs/website/refs/heads/main/examples/basic.md'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('Fetching Hono documentation for examples/basic...')
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockMarkdown)
  })

  it('should handle fetch errors gracefully for default', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching documentation:',
      'Failed to fetch documentation: 404 Not Found'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('\nPlease visit: https://hono.dev/docs')
  })

  it('should handle fetch errors gracefully with /docs/ path', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await program.parseAsync(['node', 'test', 'docs', '/docs/concepts/motivation'])

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching documentation:',
      'Failed to fetch documentation: 404 Not Found'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '\nPlease visit: https://hono.dev/docs/concepts/motivation'
    )
  })

  it('should handle fetch errors gracefully with non-docs path', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await program.parseAsync(['node', 'test', 'docs', '/examples/stytch-auth'])

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching documentation:',
      'Failed to fetch documentation: 404 Not Found'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '\nPlease visit: https://hono.dev/examples/stytch-auth'
    )
  })

  it('should handle network errors gracefully', async () => {
    const networkError = new Error('Network error')
    vi.mocked(fetch).mockRejectedValue(networkError)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching documentation:', 'Network error')
    expect(consoleLogSpy).toHaveBeenCalledWith('\nPlease visit: https://hono.dev/docs')
  })

  it('should handle stdin input when no path provided', async () => {
    const mockMarkdown = '# Middleware\n\nThis is about middleware.'
    const stdinPath = '/docs/concepts/middleware'

    // Mock process.stdin
    const originalStdin = process.stdin
    const mockStdin = {
      isTTY: false,
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(stdinPath)
      },
    }
    Object.assign(process.stdin, mockStdin)

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/honojs/website/refs/heads/main/docs/concepts/middleware.md'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Fetching Hono documentation for /docs/concepts/middleware...'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockMarkdown)

    // Restore stdin
    Object.assign(process.stdin, originalStdin)
  })

  it('should handle quoted stdin input (jq output without -r)', async () => {
    const mockMarkdown = '# API\n\nThis is about API.'
    const quotedStdinPath = '"/docs/api/context"' // Quoted path from jq

    // Mock process.stdin
    const originalStdin = process.stdin
    const mockStdin = {
      isTTY: false,
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(quotedStdinPath)
      },
    }
    Object.assign(process.stdin, mockStdin)

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/honojs/website/refs/heads/main/docs/api/context.md'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Fetching Hono documentation for /docs/api/context...'
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockMarkdown)

    // Restore stdin
    Object.assign(process.stdin, originalStdin)
  })

  it('should fallback to llms.txt when stdin is TTY', async () => {
    const mockContent = 'Hono documentation'

    // isTTY is already true from beforeEach

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockContent),
    } as Response)

    await program.parseAsync(['node', 'test', 'docs'])

    expect(fetch).toHaveBeenCalledWith('https://hono.dev/llms.txt')
    expect(consoleLogSpy).toHaveBeenCalledWith('Fetching Hono documentation...')
    expect(consoleLogSpy).toHaveBeenCalledWith('\n' + mockContent)
  })
})
