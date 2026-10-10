import { downloadTemplate } from '@bluwy/giget-core'
import type { Command } from 'commander'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandHelp } from '../../utils/help.js'
import { renderCommandHelp } from '../../utils/help.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { applyTemplate } from './apply.js'
import { detectPackageManager, detectTemplate, TEMPLATES } from './detect.js'
import { install } from './install.js'

// The starter branch that matches this CLI's Hono major
const STARTER_REF = 'v0.20'

const help: CommandHelp = {
  output:
    '{ "template": "cloudflare-workers", "detectedFrom": "wrangler.jsonc", "written": ["src/index.ts"], "skipped": ["wrangler.jsonc"] }',
  examples: ['hono init', 'hono init --template cloudflare-workers --install'],
  notes: [
    'Adds a Hono app from a create-hono template to the current directory.',
    'Without --template, the template comes from the files in the directory: wrangler.jsonc or cloudflare.config.ts → cloudflare-workers, deno.json → deno, bun.lock → bun, and so on. With no hint, a terminal shows a list to pick from; without a terminal it fails with the list.',
    'A file that already exists is never overwritten; it is listed in "skipped". package.json is merged, and its existing values win, except type.',
    'With a wrangler config in place, the template does not add cloudflare.config.ts, and the other way around.',
    '--install runs the package manager after the files are in place. It is picked from the lockfile, or from the command that started hono (npx, pnpm, yarn, bunx). Without --install, run it yourself.',
  ],
}

/**
 * Ask a human in a terminal. An agent runs the CLI without one and
 * cannot answer a prompt, so it gets the TEMPLATE_REQUIRED error.
 */
const askTemplate = async (): Promise<string | undefined> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return undefined
  }
  // Loaded only here, so no other command pays for it
  const { default: select } = await import('@inquirer/select')
  return select({
    message: 'Which template do you want to use?',
    choices: TEMPLATES.map((value) => ({ value })),
  })
}

interface InitOptions {
  template?: string
  install?: boolean
}

export function initCommand(program: Command) {
  program
    .command('init')
    .addHelpText('after', renderCommandHelp(help))
    .description('Add a Hono app to the current directory')
    .option('-t, --template <template>', `template to use (${TEMPLATES.join(' | ')})`)
    .option('-i, --install', 'install the dependencies')
    .action(
      handleErrors(async (options: InitOptions) => {
        const dir = process.cwd()
        const detected = options.template ? undefined : detectTemplate(dir)
        const template = options.template ?? detected?.template ?? (await askTemplate())
        if (!template) {
          throw new CliError('TEMPLATE_REQUIRED', 'Cannot tell which template to use', {
            suggestions: [
              'Pass one: hono init --template cloudflare-workers',
              `Templates: ${TEMPLATES.join(', ')}`,
            ],
          })
        }
        if (!TEMPLATES.includes(template)) {
          throw new CliError('INVALID_OPTION', `Unknown template: ${template}`, {
            suggestions: [`Templates: ${TEMPLATES.join(', ')}`],
          })
        }

        const downloaded = mkdtempSync(join(tmpdir(), 'hono-init-'))
        try {
          try {
            await downloadTemplate(`gh:honojs/starter/templates/${template}#${STARTER_REF}`, {
              dir: downloaded,
              force: true,
            })
          } catch (error) {
            throw new CliError(
              'TEMPLATE_DOWNLOAD_FAILED',
              `Could not download the ${template} template: ${error instanceof Error ? error.message : String(error)}`,
              { suggestions: ['Check the network and try again'] }
            )
          }
          const packageManager = detectPackageManager(dir, process.env.npm_config_user_agent)
          const result = applyTemplate(downloaded, dir, packageManager)
          if (options.install) {
            await install(packageManager, dir).catch((error: unknown) => {
              throw new CliError(
                'INSTALL_FAILED',
                `The files are in place, but ${packageManager} install failed: ${error instanceof Error ? error.message : String(error)}`,
                { suggestions: [`Run it yourself: ${packageManager} install`] }
              )
            })
          }
          printResult({
            template,
            ...(detected ? { detectedFrom: detected.from } : {}),
            ...result,
            ...(options.install ? { installed: packageManager } : {}),
            suggestions: [
              ...(options.install ? [] : [`Install the dependencies: ${packageManager} install`]),
              'Then check the app: hono request /',
            ],
          })
        } finally {
          rmSync(downloaded, { recursive: true, force: true })
        }
      })
    )
}
