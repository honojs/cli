import type { Command } from 'commander'

export function docsCommand(program: Command) {
  program
    .command('docs')
    .argument(
      '[path]',
      'Documentation path (e.g., /docs/concepts/motivation, /examples/stytch-auth)',
      ''
    )
    .description('Display Hono documentation')
    .action(async (path: string) => {
      // If no path provided, fetch llms.txt instead of index.md
      if (!path) {
        const llmsUrl = 'https://hono.dev/llms.txt'

        try {
          console.log('Fetching Hono documentation...')
          const response = await fetch(llmsUrl)

          if (!response.ok) {
            throw new Error(
              `Failed to fetch documentation: ${response.status} ${response.statusText}`
            )
          }

          const content = await response.text()
          console.log('\n' + content)
        } catch (error) {
          console.error(
            'Error fetching documentation:',
            error instanceof Error ? error.message : String(error)
          )
          console.log('\nPlease visit: https://hono.dev/docs')
        }
        return
      }

      // Ensure path starts with /
      const normalizedPath = path.startsWith('/') ? path : `/${path}`

      // Remove leading slash to get the GitHub path
      const basePath = normalizedPath.slice(1) // Remove leading slash
      const markdownUrl = `https://raw.githubusercontent.com/honojs/website/refs/heads/main/${basePath}.md`
      const webUrl = `https://hono.dev${normalizedPath}`

      try {
        console.log(`Fetching Hono documentation for ${path}...`)
        const response = await fetch(markdownUrl)

        if (!response.ok) {
          throw new Error(
            `Failed to fetch documentation: ${response.status} ${response.statusText}`
          )
        }

        const markdown = await response.text()
        console.log('\n' + markdown)
      } catch (error) {
        console.error(
          'Error fetching documentation:',
          error instanceof Error ? error.message : String(error)
        )
        console.log(`\nPlease visit: ${webUrl}`)
      }
    })
}
