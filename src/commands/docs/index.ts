import type { Command } from 'commander'
import { exec } from 'node:child_process'
import { platform } from 'node:os'

export function docsCommand(program: Command) {
  program
    .command('docs')
    .description('Open Hono documentation in browser')
    .action(() => {
      const url = 'https://hono.dev'

      // Determine the command to open URL based on platform
      let openCommand: string
      switch (platform()) {
        case 'darwin': // macOS
          openCommand = 'open'
          break
        case 'win32': // Windows
          openCommand = 'start'
          break
        default: // Linux and others
          openCommand = 'xdg-open'
          break
      }

      exec(`${openCommand} ${url}`, (error) => {
        if (error) {
          console.error(`Failed to open browser: ${error.message}`)
          console.log(`Please visit: ${url}`)
        } else {
          console.log(`Opening ${url} in your browser...`)
        }
      })
    })
}
