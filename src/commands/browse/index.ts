import type { Command } from 'commander'
import { maybeLoadBindings } from '../../utils/bindings.js'
import { parseHeaders } from '../../utils/headers.js'
import type { CommandHelp } from '../../utils/help.js'
import { renderCommandHelp } from '../../utils/help.js'
import { getBuildIterator } from '../../utils/load-app.js'
import { CliError, handleErrors, printResult } from '../../utils/output.js'
import { resolveRuntime } from '../../utils/runtime-option.js'
import { startVite } from '../../utils/vite.js'
import { startWorkerd } from '../../utils/workerd.js'
import type { BrowseAction } from './browser.js'
import { browse, loadHappyDom } from './browser.js'

const help: CommandHelp = {
  output:
    '{ "url": "/", "title": "Todos", "text": "Todos milk", "forms": [{ "action": "/", "method": "POST", "fields": { "title": "" } }], "console": [], "actions": [{ "action": "fill title=milk", "ok": true }] }',
  examples: ['hono browse /', "hono browse / --fill title=milk --click 'button[type=submit]'"],
  notes: [
    'Loads the page in happy-dom and runs its JavaScript (React hydration, client-side forms and navigation). Use it for what an HTTP request cannot show: what the page does in the browser.',
    'Every request the page makes goes to the app, the same way as request and batch. No server, no Chrome.',
    '--fill and --click run in the order given. --fill finds the field by its name, label text, placeholder, aria-label, or id (the keys in "forms"), or a CSS selector. After each action it waits until the page is quiet.',
    'The output has the final URL, the visible text, the values of each form, and the console messages, including errors. confirm() is accepted.',
    'happy-dom has no layout or CSS. Confirm visual details in a real browser.',
    'happy-dom is not a dependency of Hono CLI: install it in the project with npm install -D happy-dom.',
  ],
}

interface BrowseOptions {
  header?: string[]
  external?: string[]
  bindings: boolean
  runtime?: string
}

export function browseCommand(program: Command) {
  // --fill and --click share one list, so the actions keep their order
  const actions: BrowseAction[] = []
  const fill = (value: string) => {
    // The first "=" outside [...], so a CSS selector like input[name=a] works
    let depth = 0
    const i = [...value].findIndex((ch) => {
      depth += ch === '[' ? 1 : ch === ']' ? -1 : 0
      return ch === '=' && depth === 0
    })
    if (i <= 0) {
      throw new CliError('INVALID_OPTION', `--fill takes name=value, got ${value}`, {
        suggestions: ['Example: --fill title=milk'],
      })
    }
    actions.push({ type: 'fill', target: value.slice(0, i), value: value.slice(i + 1) })
    return actions
  }
  const click = (value: string) => {
    actions.push({ type: 'click', target: value })
    return actions
  }

  program
    .command('browse')
    .addHelpText('after', renderCommandHelp(help))
    .description('Load a page in happy-dom, run its JavaScript, fill and click')
    .argument('<path>', 'Page path (e.g. /todos)')
    .argument('[file]', 'Path to the Hono app file')
    .option(
      '--fill <name=value>',
      'type a value into a field (name, label, placeholder, or CSS selector)',
      fill
    )
    .option('--click <selector>', 'click the element that matches the CSS selector', click)
    .option(
      '-H, --header <header>',
      'header for every request the page makes',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[]
    )
    .option('--runtime <runtime>', 'runtime to execute the app (node | workerd | vite)')
    .option('--no-bindings', 'Skip loading the local Cloudflare bindings')
    .option(
      '-e, --external <package>',
      'Mark package as external (can be used multiple times)',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[]
    )
    .action(
      handleErrors(async (path: string, file: string | undefined, options: BrowseOptions) => {
        if (!path.startsWith('/')) {
          throw new CliError('INVALID_OPTION', `The path must start with /, got ${path}`, {
            suggestions: [`hono browse /${path}`],
          })
        }
        const runtime = resolveRuntime(options.runtime, file, options.bindings)
        const happyDom = await loadHappyDom()
        const headers = parseHeaders(options.header)

        if (runtime !== 'node') {
          const target = runtime === 'vite' ? await startVite() : await startWorkerd()
          try {
            printResult(await browse(happyDom, target, path, actions, headers))
          } finally {
            await target.dispose().catch(() => {})
          }
          return
        }

        const proxy = options.bindings ? await maybeLoadBindings() : undefined
        try {
          const app = (await getBuildIterator(file, false, options.external || []).next()).value
          printResult(await browse(happyDom, app, path, actions, headers, proxy?.env))
        } finally {
          await proxy?.dispose()
        }
      })
    )
}
