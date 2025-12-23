import type { Command } from 'commander'

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

export function searchCommand(program: Command) {
  program
    .command('search')
    .argument('<query>', 'Search query for Hono documentation')
    .option('-l, --limit <number>', 'Number of results to show (default: 5)', (value) => {
      const parsed = parseInt(value, 10)
      if (isNaN(parsed) || parsed < 1) {
        throw new Error(`Limit must be a number between 1 and 20. Received: ${value}\n`)
      }
      if (parsed > 20) {
        console.warn('Limit must be a number between 1 and 20\n')
        return 5
      }
      return parsed
    })
    .option('-p, --pretty', 'Display results in human-readable format')
    .description('Search Hono documentation')
    .action(async (query: string, options: { limit?: number; pretty?: boolean }) => {
      // Search-only API key - safe to embed in public code
      const ALGOLIA_APP_ID = '1GIFSU1REV'
      const ALGOLIA_API_KEY = 'c6a0f86b9a9f8551654600f28317a9e9'
      const ALGOLIA_INDEX = 'hono'

      const searchUrl = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`

      try {
        if (options.pretty) {
          console.log(`Searching for "${query}"...`)
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
            hitsPerPage: options.limit || 5,
          }),
        })

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status} ${response.statusText}`)
        }

        const data: AlgoliaResponse = await response.json()

        if (data.hits.length === 0) {
          if (options.pretty) {
            console.log('\nNo results found.')
          } else {
            console.log(JSON.stringify({ query, total: 0, results: [] }, null, 2))
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

        if (options.pretty) {
          console.log(`\nFound ${data.hits.length} results:\n`)

          // Helper function to convert HTML highlights to terminal formatting
          const formatHighlight = (text: string) => {
            return text
              .replace(/<span class="algolia-docsearch-suggestion--highlight">/g, '\x1b[33m') // Yellow
              .replace(/<\/span>/g, '\x1b[0m') // Reset
          }

          results.forEach((result, index) => {
            console.log(`${index + 1}. ${formatHighlight(result.highlightedTitle || result.title)}`)
            if (result.category) {
              console.log(`   Category: ${result.category}`)
            }
            console.log(`   URL: ${result.url}`)
            console.log(`   Command: hono docs ${result.path}`)
            console.log('')
          })
        } else {
          // Remove highlighted title from JSON output
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const jsonResults = results.map(({ highlightedTitle, ...result }) => result)
          console.log(
            JSON.stringify(
              {
                query,
                total: data.hits.length,
                results: jsonResults,
              },
              null,
              2
            )
          )
        }
      } catch (error) {
        console.error(
          'Error searching documentation:',
          error instanceof Error ? error.message : String(error)
        )
        console.log('\nPlease visit: https://hono.dev/docs')
      }
    })
}
