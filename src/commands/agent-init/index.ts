import type { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CommandHelp } from '../../utils/help.js'
import { renderCommandHelp } from '../../utils/help.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { isVoidProject } from '../../utils/vite.js'
import { detectPackageManager, detectTemplate } from '../init/detect.js'
import { runPackageManager } from '../init/install.js'
import type { Framework } from './block.js'
import { writeBlock } from './block.js'

const help: CommandHelp = {
  output:
    '{ "framework": "void", "file": "AGENTS.md", "action": "created", "added": "@hono/cli@^1.0.0" }',
  examples: ['npx @hono/cli@next agent-init', 'hono agent-init --no-install'],
  notes: [
    'Tells coding agents to verify changes with Hono CLI: writes a "Hono CLI" block to AGENTS.md (CLAUDE.md when only that exists).',
    'Running it again replaces the block in place.',
    'The block has extra lines for the framework: void (package.json depends on void), cloudflare-workers (a wrangler config or cloudflare.config.ts), or hono.',
    'Adds @hono/cli to devDependencies with the package manager of the lockfile. Skip it with --no-install.',
  ],
}

const detectFramework = (dir: string): Framework => {
  if (isVoidProject()) {
    return 'void'
  }
  if (detectTemplate(dir)?.template === 'cloudflare-workers') {
    return 'cloudflare-workers'
  }
  return 'hono'
}

const hasCli = (dir: string): boolean => {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return Boolean(pkg.dependencies?.['@hono/cli'] ?? pkg.devDependencies?.['@hono/cli'])
  } catch {
    return false
  }
}

interface AgentInitOptions {
  install: boolean
}

export function agentInitCommand(program: Command) {
  program
    .command('agent-init')
    .addHelpText('after', renderCommandHelp(help))
    .description('Tell coding agents in this project to use Hono CLI')
    .option('--no-install', 'do not add @hono/cli to devDependencies')
    .action(
      handleErrors(async (options: AgentInitOptions, command: Command) => {
        const dir = process.cwd()
        const framework = detectFramework(dir)
        const written = writeBlock(dir, framework)

        const version = command.parent?.version()
        const spec = version ? `@hono/cli@^${version}` : '@hono/cli'
        const packageManager = detectPackageManager(dir, process.env.npm_config_user_agent)
        const addCommand = [packageManager, 'add', '-D', spec]
        const needsCli = !hasCli(dir)
        if (needsCli && options.install) {
          await runPackageManager(packageManager, addCommand.slice(1), dir).catch(
            (error: unknown) => {
              throw new CliError(
                'INSTALL_FAILED',
                `${written.file} is written, but adding @hono/cli failed: ${error instanceof Error ? error.message : String(error)}`,
                { suggestions: [`Run it yourself: ${addCommand.join(' ')}`] }
              )
            }
          )
        }
        printResult({
          framework,
          ...written,
          ...(needsCli && options.install ? { added: spec } : {}),
          ...(needsCli && !options.install
            ? { suggestions: [`Add Hono CLI: ${addCommand.join(' ')}`] }
            : {}),
        })
      })
    )
}
