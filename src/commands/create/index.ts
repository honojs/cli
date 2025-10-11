import type { Command } from 'commander'
import { spawn } from 'node:child_process'

export function createCommand(program: Command) {
  program
    .command('create')
    .description('Create a new Hono project')
    .argument('[target]', 'target directory')
    .option(
      '-t, --template <template>',
      'Template to use (aws-lambda, bun, cloudflare-workers, cloudflare-workers+vite, deno, fastly, lambda-edge, netlify, nextjs, nodejs, vercel, cloudflare-pages, x-basic)'
    )
    .option('-i, --install', 'Install dependencies')
    .option('-p, --pm <pm>', 'Package manager to use (npm, bun, deno, pnpm, yarn)')
    .option('-o, --offline', 'Use offline mode')
    .action(
      (
        target: string,
        options: { template?: string; install?: boolean; pm?: string; offline?: boolean }
      ) => {
        const args = ['create', 'hono@latest']

        if (target) {
          args.push(target)
        }

        // Add known options
        if (options.template) {
          args.push('--template', options.template)
        }
        if (options.install) {
          args.push('--install')
        }
        if (options.pm) {
          args.push('--pm', options.pm)
        }
        if (options.offline) {
          args.push('--offline')
        }

        const npm = spawn('npm', args, {
          stdio: 'inherit',
        })

        npm.on('error', (error) => {
          console.error(`Failed to execute npm: ${error.message}`)
          throw new Error(`Failed to execute npm: ${error.message}`)
        })

        npm.on('exit', (code) => {
          if (code !== 0) {
            throw new Error(`npm create hono@latest exited with code ${code}`)
          }
        })
      }
    )
}
