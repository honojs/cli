import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchCommand } from './index.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Search Command', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should output valid JSON with correct structure', async () => {
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

    const logSpy = vi.spyOn(console, 'log')
    searchCommand(program)

    await program.parseAsync(['node', 'test', 'search', 'middleware'])

    // Get the JSON output
    const jsonOutput = logSpy.mock.calls[0][0]

    // Should be valid JSON
    expect(() => JSON.parse(jsonOutput)).not.toThrow()

    const parsed = JSON.parse(jsonOutput)

    // Should match expected structure exactly
    expect(parsed).toEqual({
      query: 'middleware',
      total: 2,
      results: [
        {
          title: 'Getting Started',
          category: '',
          url: 'https://hono.dev/docs/getting-started',
          path: '/docs/getting-started',
        },
        {
          title: 'Middleware',
          category: 'Basic Usage',
          url: 'https://hono.dev/docs/middleware',
          path: '/docs/middleware',
        },
      ],
    })
  })

  it('should handle no results with valid JSON', async () => {
    const mockResponse = {
      hits: [],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const logSpy = vi.spyOn(console, 'log')
    searchCommand(program)

    await program.parseAsync(['node', 'test', 'search', 'nonexistent'])

    const jsonOutput = logSpy.mock.calls[0][0]

    // Should be valid JSON
    expect(() => JSON.parse(jsonOutput)).not.toThrow()

    const parsed = JSON.parse(jsonOutput)
    expect(parsed).toEqual({
      query: 'nonexistent',
      total: 0,
      results: [],
    })
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

    expect(errorSpy).toHaveBeenCalled()
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

  it('should warn when limit is over 20 and default to 5', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockResponse = { hits: [] }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    searchCommand(program)

    await program.parseAsync(['node', 'test', 'search', 'test', '--limit', '21'])

    expect(warnSpy).toHaveBeenCalledWith('Limit must be a number between 1 and 20\n')

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
          hitsPerPage: 5,
        }),
      }
    )
  })

  describe('should throw error for invalid limit', () => {
    it.each([0, 'a'])('should throw error when limit is %s', async (limit) => {
      searchCommand(program)

      await expect(
        program.parseAsync(['node', 'test', 'search', 'test', '--limit', String(limit)])
      ).rejects.toThrow()
    })
  })
})
