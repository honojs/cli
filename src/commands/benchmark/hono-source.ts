import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CliError } from '../../utils/output.js'

/**
 * A Hono to benchmark against. `resolveDir` makes `hono` imports
 * resolve there instead of the project. Undefined means the project's
 * own Hono.
 */
export interface HonoSource {
  label: string
  resolveDir?: string
  cleanup?: () => void
}

export const projectHonoSource = (): HonoSource => {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'node_modules', 'hono', 'package.json'), 'utf-8')
    )
    return { label: packageJson.version }
  } catch {
    return { label: 'project' }
  }
}

export const resolveHonoSource = async (spec: string): Promise<HonoSource> => {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return pathSource(spec)
  }
  return npmSource(spec)
}

const pathSource = (spec: string): HonoSource => {
  const packageDir = resolve(process.cwd(), spec)
  const packageJsonPath = join(packageDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    throw new CliError('HONO_SOURCE_NOT_FOUND', `No package found at ${spec}`, {
      suggestions: ['Pass a path to a hono package directory, or a version like 4.13.0'],
    })
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  // A local checkout resolves through a wrapper dir with a node_modules link
  const dir = mkdtempSync(join(tmpdir(), 'hono-cli-bench-'))
  const nodeModules = join(dir, 'node_modules')
  mkdirSync(nodeModules, { recursive: true })
  symlinkSync(packageDir, join(nodeModules, 'hono'), 'dir')
  return {
    label: `${packageJson.version} (${spec})`,
    resolveDir: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

const npmSource = async (spec: string): Promise<HonoSource> => {
  const dir = mkdtempSync(join(tmpdir(), 'hono-cli-bench-'))
  await new Promise<void>((resolvePromise, reject) => {
    execFile(
      'npm',
      ['install', `hono@${spec}`, '--prefix', dir, '--no-audit', '--no-fund', '--silent'],
      (error) => {
        if (error) {
          rmSync(dir, { recursive: true, force: true })
          reject(
            new CliError('HONO_INSTALL_FAILED', `Failed to install hono@${spec}`, {
              suggestions: ['Check the version. Published versions: npm view hono versions'],
            })
          )
          return
        }
        resolvePromise()
      }
    )
  })
  const packageJson = JSON.parse(
    readFileSync(join(dir, 'node_modules', 'hono', 'package.json'), 'utf-8')
  )
  return {
    label: packageJson.version,
    resolveDir: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}
