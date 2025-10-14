import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchCommand } from './index.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Search Command', () => {
  let program: Command
  let consoleSpy: any

  beforeEach(() => {
    program = new Command()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should search and display results with URLs', async () => {
    const mockResponse = {
      hits: [
        {
          title: 'Getting Started',
          url: 'https://hono.dev/docs/getting-started',
        },
        {
          url: 'https://hono.dev/docs/middleware',
          hierarchy: {
            lvl0: 'Documentation',
            lvl1: 'Middleware',
            lvl2: 'Basic Usage',
          },
        },
      ],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    searchCommand(program)

    // Execute the search command
    await program.parseAsync(['node', 'test', 'search', 'middleware'])

    expect(mockFetch).toHaveBeenCalledWith(
      'https://1GIFSU1REV-dsn.algolia.net/1/indexes/hono/query',
      {
        method: 'POST',
        headers: {
          'X-Algolia-API-Key': 'c6a0f86b9a9f8551654600f28317a9e9',
          'X-Algolia-Application-Id': '1GIFSU1REV',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'middleware',
          hitsPerPage: 5,
        }),
      }
    )

    expect(consoleSpy).toHaveBeenCalledWith('Searching for "middleware"...')
    expect(consoleSpy).toHaveBeenCalledWith('\nFound 2 results:\n')
    expect(consoleSpy).toHaveBeenCalledWith('1. Getting Started')
    expect(consoleSpy).toHaveBeenCalledWith('   URL: https://hono.dev/docs/getting-started')
    expect(consoleSpy).toHaveBeenCalledWith('   Command: hono docs /docs/getting-started')
    expect(consoleSpy).toHaveBeenCalledWith('2. Middleware')
    expect(consoleSpy).toHaveBeenCalledWith('   Category: Basic Usage')
    expect(consoleSpy).toHaveBeenCalledWith('   URL: https://hono.dev/docs/middleware')
    expect(consoleSpy).toHaveBeenCalledWith('   Command: hono docs /docs/middleware')
  })

  it('should handle no results', async () => {
    const mockResponse = {
      hits: [],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    searchCommand(program)

    await program.parseAsync(['node', 'test', 'search', 'nonexistent'])

    expect(consoleSpy).toHaveBeenCalledWith('\nNo results found.')
  })

  it('should handle API errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    searchCommand(program)

    await program.parseAsync(['node', 'test', 'search', 'test'])

    expect(errorSpy).toHaveBeenCalledWith(
      'Error searching documentation:',
      'Search failed: 404 Not Found'
    )
    expect(consoleSpy).toHaveBeenCalledWith('\nPlease visit: https://hono.dev/docs')
  })

  it('should use custom limit option', async () => {
    const mockResponse = { hits: [] }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    searchCommand(program)

    await program.parseAsync(['node', 'test', 'search', 'test', '--limit', '3'])

    expect(mockFetch).toHaveBeenCalledWith(
      'https://1GIFSU1REV-dsn.algolia.net/1/indexes/hono/query',
      {
        method: 'POST',
        headers: {
          'X-Algolia-API-Key': 'c6a0f86b9a9f8551654600f28317a9e9',
          'X-Algolia-Application-Id': '1GIFSU1REV',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'test',
          hitsPerPage: 3,
        }),
      }
    )
  })
})
