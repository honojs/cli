import type { Command } from 'commander'

async function fetchAndDisplayContent(url: string, fallbackUrl?: string): Promise<void> {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch documentation: ${response.status} ${response.statusText}`)
    }

    const content = await response.text()
    console.log('\n' + content)
  } catch (error) {
    console.error(
      'Error fetching documentation:',
      error instanceof Error ? error.message : String(error)
    )
    console.log(`\nPlease visit: ${fallbackUrl || 'https://hono.dev/docs'}`)
  }
}

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
      let finalPath = path

      // If no path provided, check for stdin input
      if (!path) {
        // Check if stdin is piped (not a TTY)
        if (!process.stdin.isTTY) {
          try {
            const chunks: Buffer[] = []
            for await (const chunk of process.stdin) {
              chunks.push(chunk)
            }
            const stdinInput = Buffer.concat(chunks).toString().trim()
            if (stdinInput) {
              // Remove quotes if present (handles jq output without -r flag)
              finalPath = stdinInput.replace(/^["'](.*)["']$/, '$1')
            }
          } catch (error) {
            console.error('Error reading from stdin:', error)
          }
        }

        // If still no path, fetch llms.txt
        if (!finalPath) {
          console.log('Fetching Hono documentation...')
          await fetchAndDisplayContent('https://hono.dev/llms.txt')
          return
        }
      }

      // Ensure path starts with /
      const normalizedPath = finalPath.startsWith('/') ? finalPath : `/${finalPath}`

      // Remove leading slash to get the GitHub path
      const basePath = normalizedPath.slice(1) // Remove leading slash
      const markdownUrl = `https://raw.githubusercontent.com/honojs/website/refs/heads/main/${basePath}.md`
      const webUrl = `https://hono.dev${normalizedPath}`

      console.log(`Fetching Hono documentation for ${finalPath}...`)
      await fetchAndDisplayContent(markdownUrl, webUrl)
    })
}
