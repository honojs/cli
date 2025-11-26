import type { TakoArgs, TakoHandler } from '@takojs/tako'

interface AlgoliaHit {
  title?: string
  url: string
  content?: string
  anchor?: string
  type?: string
  hierarchy?: {
    lvl0?: string
    lvl1?: string
    lvl2?: string
    lvl3?: string
    lvl4?: string
    lvl5?: string
    lvl6?: string
  }
  _highlightResult?: {
    hierarchy?: {
      lvl0?: { value: string; matchLevel: string }
      lvl1?: { value: string; matchLevel: string }
      lvl2?: { value: string; matchLevel: string }
    }
    content?: { value: string; matchLevel: string }
  }
}

interface AlgoliaResponse {
  hits: AlgoliaHit[]
}

export const searchArgs: TakoArgs = {
  config: {
    options: {
      limit: {
        type: 'string',
        short: 'l',
      },
      pretty: {
        type: 'boolean',
        short: 'p',
      },
    },
  },
  metadata: {
    help: 'Search Hono documentation',
    required: true,
    placeholder: '<query>',
    options: {
      limit: {
        help: 'Number of results to show (default: 5)',
        placeholder: '<number>',
      },
      pretty: {
        help: 'Display results in human-readable format',
      },
    },
  },
}

export const searchValidation: TakoHandler = async (c, next) => {
  const { limit } = c.scriptArgs.values as { limit?: string }
  if (limit) {
    const parsed = parseInt(limit, 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 20) {
      c.print({
        message: 'Limit must be a number between 1 and 20\n',
        style: 'yellow',
        level: 'warn',
      })
      c.args.values.limit = 5
    } else {
      c.args.values.limit = parsed
    }
  }
  await next()
}

export const searchCommand: TakoHandler = async (c) => {
  const query = c.scriptArgs.positionals[0]
  const { pretty } = c.scriptArgs.values
  const { limit } = c.args.values as { limit?: number }

  // Search-only API key - safe to embed in public code
  const ALGOLIA_APP_ID = '1GIFSU1REV'
  const ALGOLIA_API_KEY = 'c6a0f86b9a9f8551654600f28317a9e9'
  const ALGOLIA_INDEX = 'hono'

  const searchUrl = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`

  try {
    if (pretty) {
      c.print({ message: `Searching for "${query}"...` })
    }

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'X-Algolia-API-Key': ALGOLIA_API_KEY,
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        hitsPerPage: limit || 5,
      }),
    })

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`)
    }

    const data: AlgoliaResponse = await response.json()

    if (data.hits.length === 0) {
      if (pretty) {
        c.print({ message: '\nNo results found.' })
      } else {
        c.print({ message: JSON.stringify({ query, total: 0, results: [] }, null, 2) })
      }
      return
    }

    // Helper function to clean HTML tags completely
    const cleanHighlight = (text: string) => text.replace(/<[^>]*>/g, '')

    const results = data.hits.map((hit) => {
      // Get title from various sources
      let title = hit.title
      let highlightedTitle = title
      if (!title && hit._highlightResult?.hierarchy?.lvl1) {
        title = cleanHighlight(hit._highlightResult.hierarchy.lvl1.value)
        highlightedTitle = hit._highlightResult.hierarchy.lvl1.value
      }
      if (!title) {
        title = hit.hierarchy?.lvl1 || hit.hierarchy?.lvl0 || 'Untitled'
        highlightedTitle = title
      }

      // Build hierarchy path
      const hierarchyParts: string[] = []
      if (hit.hierarchy?.lvl0 && hit.hierarchy.lvl0 !== 'Documentation') {
        hierarchyParts.push(hit.hierarchy.lvl0)
      }
      if (hit.hierarchy?.lvl1 && hit.hierarchy.lvl1 !== title) {
        hierarchyParts.push(cleanHighlight(hit.hierarchy.lvl1))
      }
      if (hit.hierarchy?.lvl2) {
        hierarchyParts.push(cleanHighlight(hit.hierarchy.lvl2))
      }

      const category = hierarchyParts.length > 0 ? hierarchyParts.join(' > ') : ''
      const url = hit.url
      const urlPath = new URL(url).pathname

      return {
        title,
        highlightedTitle,
        category,
        url,
        path: urlPath,
      }
    })

    if (pretty) {
      c.print({ message: `\nFound ${data.hits.length} results:\n` })

      // Helper function to convert HTML highlights to terminal formatting
      const formatHighlight = (text: string) => {
        return text
          .replace(/<span class="algolia-docsearch-suggestion--highlight">/g, '\x1b[33m') // Yellow
          .replace(/<\/span>/g, '\x1b[0m') // Reset
      }

      results.forEach((result, index) => {
        c.print({
          message: `${index + 1}. ${formatHighlight(result.highlightedTitle || result.title)}`,
        })
        if (result.category) {
          c.print({ message: `   Category: ${result.category}` })
        }
        c.print({ message: `   URL: ${result.url}` })
        c.print({ message: `   Command: hono docs ${result.path}` })
        c.print({ message: '' })
      })
    } else {
      // Remove highlighted title from JSON output
      const jsonResults = results.map(({ highlightedTitle, ...result }) => result)
      c.print({
        message: JSON.stringify(
          {
            query,
            total: data.hits.length,
            results: jsonResults,
          },
          null,
          2
        ),
      })
    }
  } catch (error) {
    c.print({
      message: [
        'Error searching documentation:',
        error instanceof Error ? error.message : String(error),
      ],
      style: 'red',
      level: 'error',
    })
    c.print({ message: '\nPlease visit: https://hono.dev/docs' })
  }
}
