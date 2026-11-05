import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAndImportApp } from './build.js'

describe('buildAndImportApp with external packages', () => {
  const cwd = process.cwd()

  afterEach(() => {
    process.chdir(cwd)
  })

  const setupProject = (app: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'hono-cli-external-'))
    const pkg = join(dir, 'node_modules', 'probe-pkg')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(
      join(pkg, 'package.json'),
      '{"name":"probe-pkg","type":"module","main":"index.js"}'
    )
    writeFileSync(join(pkg, 'index.js'), "export const value = 'from the project'")
    writeFileSync(join(dir, 'app.ts'), app)
    process.chdir(dir)
    return join(dir, 'app.ts')
  }

  it('should resolve an external package from the project', async () => {
    const entry = setupProject(
      "import { value } from 'probe-pkg'\nexport default { value, request: () => value }"
    )
    const { value: app } = await buildAndImportApp(entry, { external: ['probe-pkg'] }).next()
    expect(app).toHaveProperty('value', 'from the project')
  })

  it('should not listen when the app calls serve() from @hono/node-server', async () => {
    const entry = setupProject(`import { serve, other } from '@hono/node-server'
const server = serve({ port: 3000 })
export default { server, other, request: () => 'ok' }`)
    const pkg = join(dirname(entry), 'node_modules', '@hono', 'node-server')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(
      join(pkg, 'package.json'),
      '{"name":"@hono/node-server","type":"module","main":"index.js"}'
    )
    writeFileSync(
      join(pkg, 'index.js'),
      `export const serve = () => { throw new Error('listened') }
export const createAdaptorServer = (options) => ({ options })
export const other = 'kept'`
    )
    const { value: app } = await buildAndImportApp(entry, {
      external: ['@hono/node-server'],
    }).next()
    expect(app).toHaveProperty('server', { options: { port: 3000 } })
    expect(app).toHaveProperty('other', 'kept')
  })

  it('should not put the bundle in the error for a missing package', async () => {
    const entry = setupProject("import 'not-installed'\nexport default { request: () => 'ok' }")
    const error = await buildAndImportApp(entry, { external: ['not-installed'] })
      .next()
      .catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("Cannot find package 'not-installed'")
    expect((error as Error).message).not.toContain('base64')
  })
})
