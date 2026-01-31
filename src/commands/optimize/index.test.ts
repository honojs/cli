import { Command } from 'commander'
import { describe, it, expect, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { optimizeCommand } from './index'

const program = new Command()
optimizeCommand(program)

const writePackageJSON = (dir: string, honoVersion: string = 'latest') => {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'hono-cli-optimize-test',
      type: 'module',
      dependencies: { hono: honoVersion },
    })
  )
}

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
      writePackageJSON(dir, honoVersion)
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
    writePackageJSON(dir)
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
    writePackageJSON(dir)
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

  describe('request body API removal', () => {
    it(
      'should remove request body APIs when only GET/OPTIONS methods are used',
      { timeout: 0 },
      async () => {
        writePackageJSON(dir)
        await npmInstall()
        writeFileSync(
          join(dir, './src/index.ts'),
          `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          app.options('/cors', (c) => c.text('OK'))
          export default app
        `
        )
        await program.parseAsync(['node', 'hono', 'optimize'])

        const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
        expect(content).not.toMatch(/parseBody/)
        expect(content).not.toMatch(/#cachedBody/)
      }
    )

    it('should keep request body APIs when POST method is used', { timeout: 0 }, async () => {
      writePackageJSON(dir)
      await npmInstall()
      writeFileSync(
        join(dir, './src/index.ts'),
        `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          app.post('/data', async (c) => {
            const body = await c.req.json()
            return c.json(body)
          })
          export default app
        `
      )
      await program.parseAsync(['node', 'hono', 'optimize'])

      const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
      expect(content).toMatch(/parseBody/)
    })

    it(
      'should keep request body APIs when --no-request-body-api-removal is specified',
      { timeout: 0 },
      async () => {
        writePackageJSON(dir)
        await npmInstall()
        writeFileSync(
          join(dir, './src/index.ts'),
          `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          export default app
        `
        )
        await program.parseAsync(['node', 'hono', 'optimize', '--no-request-body-api-removal'])

        const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
        expect(content).toMatch(/parseBody/)
      }
    )
  })

  describe('Hono API removal', () => {
    it('should remove unused Hono APIs (route, mount, fire)', { timeout: 0 }, async () => {
      writePackageJSON(dir)
      await npmInstall()
      writeFileSync(
        join(dir, './src/index.ts'),
        `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          export default app
        `
      )
      await program.parseAsync(['node', 'hono', 'optimize', '-m'])

      const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
      // These methods should be removed when unused
      expect(content).not.toMatch(/\bfire\s*\(/)
    })

    it('should keep Hono APIs when route() is used', { timeout: 0 }, async () => {
      writePackageJSON(dir)
      await npmInstall()
      writeFileSync(
        join(dir, './src/index.ts'),
        `
          import { Hono } from 'hono'
          const app = new Hono()
          const subApp = new Hono()
          subApp.get('/', (c) => c.text('Sub'))
          app.route('/sub', subApp)
          export default app
        `
      )
      await program.parseAsync(['node', 'hono', 'optimize', '-m'])

      const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
      // route method should be kept when used
      expect(content).toMatch(/\broute\b/)
    })

    it('should keep Hono APIs when mount() is used', { timeout: 0 }, async () => {
      writePackageJSON(dir)
      await npmInstall()
      writeFileSync(
        join(dir, './src/index.ts'),
        `
          import { Hono } from 'hono'
          const app = new Hono()
          app.mount('/static', (req) => new Response('static'))
          export default app
        `
      )
      await program.parseAsync(['node', 'hono', 'optimize', '-m'])

      const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
      // mount method should be kept when used
      expect(content).toMatch(/\bmount\b/)
    })

    it(
      'should keep Hono APIs when --no-hono-api-removal is specified',
      { timeout: 0 },
      async () => {
        writePackageJSON(dir)
        await npmInstall()
        writeFileSync(
          join(dir, './src/index.ts'),
          `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          export default app
        `
        )
        await program.parseAsync(['node', 'hono', 'optimize', '-m', '--no-hono-api-removal'])

        const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
        // fire method should be kept when --no-hono-api-removal is specified
        expect(content).toMatch(/\bfire\b/)
      }
    )
  })

  describe('context response API removal', () => {
    it('should remove unused context response APIs', { timeout: 0 }, async () => {
      writePackageJSON(dir)
      await npmInstall()
      writeFileSync(
        join(dir, './src/index.ts'),
        `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          export default app
        `
      )
      await program.parseAsync(['node', 'hono', 'optimize'])

      const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
      // Unused response methods should be removed (json, html, redirect)
      // text is used, so it should remain
      expect(content).toMatch(/\btext\s*\(/)
    })

    it('should keep context response APIs when they are used', { timeout: 0 }, async () => {
      writePackageJSON(dir)
      await npmInstall()
      writeFileSync(
        join(dir, './src/index.ts'),
        `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.json({ message: 'Hello' }))
          app.get('/html', (c) => c.html('<h1>Hello</h1>'))
          app.get('/redirect', (c) => c.redirect('/'))
          export default app
        `
      )
      await program.parseAsync(['node', 'hono', 'optimize'])

      const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
      // Used response methods should be kept
      expect(content).toMatch(/\bjson\s*\(/)
      expect(content).toMatch(/\bhtml\s*\(/)
      expect(content).toMatch(/\bredirect\s*\(/)
    })

    it(
      'should keep context response APIs when --no-context-response-api-removal is specified',
      { timeout: 0 },
      async () => {
        writePackageJSON(dir)
        await npmInstall()
        writeFileSync(
          join(dir, './src/index.ts'),
          `
          import { Hono } from 'hono'
          const app = new Hono()
          app.get('/', (c) => c.text('Hello'))
          export default app
        `
        )
        await program.parseAsync(['node', 'hono', 'optimize', '--no-context-response-api-removal'])

        const content = readFileSync(join(dir, './dist/index.js'), 'utf-8')
        // All response methods should be kept when --no-context-response-api-removal is specified
        expect(content).toMatch(/\bjson\s*\(/)
        expect(content).toMatch(/\bhtml\s*\(/)
        expect(content).toMatch(/\bredirect\s*\(/)
      }
    )
  })
})
