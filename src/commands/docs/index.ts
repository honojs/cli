import type { Tako, TakoArgs, TakoHandler } from '@takojs/tako'
import { Buffer } from 'node:buffer'
import * as process from 'node:process'

async function fetchAndDisplayContent(c: Tako, url: string, fallbackUrl?: string): Promise<void> {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch documentation: ${response.status} ${response.statusText}`)
    }

    const content = await response.text()
    c.print({ message: '\n' + content })
  } catch (error) {
    c.print({
      message: [
        'Error fetching documentation:',
        error instanceof Error ? error.message : String(error),
      ],
      style: 'red',
      level: 'error',
    })
    c.print({ message: `\nPlease visit: ${fallbackUrl || 'https://hono.dev/docs'}` })
  }
}

export const docsArgs: TakoArgs = {
  metadata: {
    help: 'Display Hono documentation',
  },
}

export const docsValidation: TakoHandler = (_c, next) => {
  next()
}

export const docsCommand: TakoHandler = async (c) => {
  let finalPath = c.scriptArgs.positionals[0]

  // If no path provided, check for stdin input
  if (!finalPath) {
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
        c.print({
          message: [
            'Error reading from stdin:',
            error instanceof Error ? error.message : String(error)
          ],
          style: 'red',
          level: 'error',
        })
      }
    }

    // If still no path, fetch llms.txt
    if (!finalPath) {
      c.print({ message: 'Fetching Hono documentation...' })
      await fetchAndDisplayContent(c, 'https://hono.dev/llms.txt')
      return
    }
  }

  // Ensure path starts with /
  const normalizedPath = finalPath.startsWith('/') ? finalPath : `/${finalPath}`

  // Remove leading slash to get the GitHub path
  const basePath = normalizedPath.slice(1) // Remove leading slash
  const markdownUrl = `https://raw.githubusercontent.com/honojs/website/refs/heads/main/${basePath}.md`
  const webUrl = `https://hono.dev${normalizedPath}`

  c.print({ message: `Fetching Hono documentation for ${finalPath}...` })
  await fetchAndDisplayContent(c, markdownUrl, webUrl)
}
