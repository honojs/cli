import { Command } from 'commander'
import { describe, it, expect, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { optimizeCommand } from './index'

const program = new Command()
optimizeCommand(program)

const npmInstall = async () =>
  new Promise<void>((resolve) => {
    const child = execFile('npm', ['install'])
    child.on('exit', () => {
      resolve()
    })
  })

describe('optimizeCommand', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hono-cli-optimize-test'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    process.chdir(dir)
  })

  it('should throws an error if entry file not found', async () => {
    await expect(
      program.parseAsync(['node', 'hono', 'optimize', './non-existent-file.ts'])
    ).rejects.toThrowError()
  })

  it.each([
    {
      name: 'src/index.ts',
      files: [
        {
          path: './src/index.ts',
          content: `
            import { Hono } from 'hono'
            const app = new Hono<{ Bindings: { FOO: string } }>()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new PreparedRegExpRouter(...routerParams)`,
      },
    },
    {
      name: 'src/index.tsx',
      files: [
        {
          path: './src/index.tsx',
          content: `
            import { Hono } from 'hono'
            const app = new Hono()
            app.get('/', (c) => c.html(<div>Hello, World!</div>))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new PreparedRegExpRouter(...routerParams)`,
      },
    },
    {
      name: 'src/index.js',
      files: [
        {
          path: './src/index.js',
          content: `
            import { Hono } from 'hono'
            const app = new Hono()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new PreparedRegExpRouter(...routerParams)`,
      },
    },
    {
      name: 'src/index.jsx',
      files: [
        {
          path: './src/index.jsx',
          content: `
            import { Hono } from 'hono'
            const app = new Hono()
            app.get('/', (c) => c.html(<div>Hello, World!</div>))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new PreparedRegExpRouter(...routerParams)`,
      },
    },
    {
      name: 'specify entry file',
      args: ['./src/app.ts'],
      files: [
        {
          path: './src/app.ts',
          content: `
            import { Hono } from 'hono'
            const app = new Hono<{ Bindings: { FOO: string } }>()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new PreparedRegExpRouter(...routerParams)`,
      },
    },
    {
      name: 'specify outfile option',
      args: ['-o', './dist/app.js'],
      files: [
        {
          path: './src/index.ts',
          content: `
            import { Hono } from 'hono'
            const app = new Hono<{ Bindings: { FOO: string } }>()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/app.js',
        content: `this.router = new PreparedRegExpRouter(...routerParams)`,
      },
    },
    {
      name: 'fallback to TrieRouter',
      files: [
        {
          path: './src/index.ts',
          content: `
            import { Hono } from 'hono'
            const app = new Hono<{ Bindings: { FOO: string } }>()
            app.get('/foo/:capture{ba(r|z)}', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new TrieRouter()`,
      },
    },
    {
      name: 'hono@4.9.10 does not have PreparedRegExpRouter',
      honoVersion: '4.9.10',
      files: [
        {
          path: './src/index.ts',
          content: `
            import { Hono } from 'hono'
            const app = new Hono()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        content: `this.router = new RegExpRouter()`,
      },
    },
    {
      name: 'specify minify option',
      args: ['-m'],
      files: [
        {
          path: './src/index.ts',
          content: `
            import { Hono } from 'hono'
            const app = new Hono<{ Bindings: { FOO: string } }>()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `,
        },
      ],
      result: {
        path: './dist/index.js',
        lineCount: 2,
      },
    },
  ])(
    'should success to optimize: $name',
    { timeout: 0 },
    async ({ honoVersion, files, result, args }) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'hono-cli-optimize-test',
          type: 'module',
          dependencies: {
            hono: honoVersion ?? '4.9.11',
          },
        })
      )
      await npmInstall()
      for (const file of files) {
        writeFileSync(join(dir, file.path), file.content)
      }
      await program.parseAsync(['node', 'hono', 'optimize', ...(args ?? [])])

      const content = readFileSync(join(dir, result.path), 'utf-8')
      if (result.lineCount) {
        expect(content.split('\n').length).toBe(result.lineCount)
      }
      if (result.content) {
        expect(content).toMatch(result.content)
      }
    }
  )

  it.each(
    [
      'node14',
      'node18',
      'node20',
      'node22',
      'node24',
      'node26',
      'deno1',
      'deno2',
      'es2022',
      'es2024',
    ].map((target) => ({
      name: `should success with environment target: ${target}`,
      target: target,
    }))
  )('$name', { timeout: 0 }, async ({ target }) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'hono-cli-optimize-test',
        type: 'module',
        dependencies: {
          hono: 'latest',
        },
      })
    )
    await npmInstall()
    writeFileSync(
      join(dir, './src/index.ts'),
      `
            import { Hono } from 'hono'
            const app = new Hono()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `
    )

    const promise = program.parseAsync(['node', 'hono', 'optimize', '-t', target])
    await expect(promise).resolves.not.toThrow()
  })

  it('should throw an error with invalid environment target', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'hono-cli-optimize-test',
        type: 'module',
        dependencies: {
          hono: 'latest',
        },
      })
    )
    await npmInstall()
    writeFileSync(
      join(dir, './src/index.ts'),
      `
            import { Hono } from 'hono'
            const app = new Hono()
            app.get('/', (c) => c.text('Hello, World!'))
            export default app
            `
    )

    const promise = program.parseAsync(['node', 'hono', 'optimize', '-t', 'hoge'])
    await expect(promise).rejects.toThrowError()
  })
})
