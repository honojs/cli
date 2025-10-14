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
    .option('-l, --limit <number>', 'Number of results to show (default: 5)', '5')
    .description('Search Hono documentation')
    .action(async (query: string, options: { limit: string }) => {
      // Search-only API key - safe to embed in public code
      const ALGOLIA_APP_ID = '1GIFSU1REV'
      const ALGOLIA_API_KEY = 'c6a0f86b9a9f8551654600f28317a9e9'
      const ALGOLIA_INDEX = 'hono'

      const limit = Math.max(1, Math.min(20, parseInt(options.limit, 10) || 5))
      const searchUrl = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`

      try {
        console.log(`Searching for "${query}"...`)

        const response = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'X-Algolia-API-Key': ALGOLIA_API_KEY,
            'X-Algolia-Application-Id': ALGOLIA_APP_ID,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            hitsPerPage: limit,
          }),
        })

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status} ${response.statusText}`)
        }

        const data: AlgoliaResponse = await response.json()

        if (data.hits.length === 0) {
          console.log('\nNo results found.')
          return
        }

        console.log(`\nFound ${data.hits.length} results:\n`)

        data.hits.forEach((hit, index) => {
          // Helper function to convert HTML highlights to terminal formatting
          const formatHighlight = (text: string) => {
            return text
              .replace(/<span class="algolia-docsearch-suggestion--highlight">/g, '\x1b[33m') // Yellow
              .replace(/<\/span>/g, '\x1b[0m') // Reset
          }

          // Helper function to clean HTML tags completely
          const cleanHighlight = (text: string) => text.replace(/<[^>]*>/g, '')

          // Get title from various sources, with highlight support
          let title = hit.title
          if (!title && hit._highlightResult?.hierarchy?.lvl1) {
            title = formatHighlight(hit._highlightResult.hierarchy.lvl1.value)
          }
          if (!title) {
            title = hit.hierarchy?.lvl1 || hit.hierarchy?.lvl0 || 'Untitled'
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

          const hierarchyPath = hierarchyParts.length > 0 ? hierarchyParts.join(' > ') : ''

          const url = hit.url
          const urlPath = new URL(url).pathname

          console.log(`${index + 1}. ${title}`)
          if (hierarchyPath) {
            console.log(`   Category: ${hierarchyPath}`)
          }

          // Show content excerpt if available, with highlight support
          if (hit.content) {
            const excerpt =
              hit.content.length > 100 ? hit.content.slice(0, 100) + '...' : hit.content
            console.log(`   Description: ${excerpt}`)
          } else if (hit._highlightResult?.content) {
            const highlightedContent = formatHighlight(hit._highlightResult.content.value)
            const excerpt =
              highlightedContent.length > 100
                ? highlightedContent.slice(0, 100) + '...'
                : highlightedContent
            console.log(`   Description: ${excerpt}`)
          }

          console.log(`   URL: ${url}`)
          console.log(`   Command: hono docs ${urlPath}`)
          console.log('')
        })
      } catch (error) {
        console.error(
          'Error searching documentation:',
          error instanceof Error ? error.message : String(error)
        )
        console.log('\nPlease visit: https://hono.dev/docs')
      }
    })
}
