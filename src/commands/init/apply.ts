import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

export interface InitResult {
  /** Files copied from the template */
  written: string[]
  /** Files that already existed, left as they are */
  skipped: string[]
}

type PackageJson = Record<string, unknown>

const MERGED_FIELDS = ['scripts', 'dependencies', 'devDependencies', 'peerDependencies']

// The same placeholders that create-hono fills
const CONFIG_FILES = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc', 'cloudflare.config.ts']
const PROJECT_NAME = /%%PROJECT_NAME.*%%/g
const COMPATIBILITY_DATES: [RegExp, (date: string) => string][] = [
  [/compatibility_date\s*=\s*"\d{4}-\d{2}-\d{2}"/, (d) => `compatibility_date = "${d}"`],
  [/"compatibility_date"\s*:\s*"\d{4}-\d{2}-\d{2}"/, (d) => `"compatibility_date": "${d}"`],
  [/compatibilityDate\s*:\s*['"]\d{4}-\d{2}-\d{2}['"]/, (d) => `compatibilityDate: '${d}'`],
]

const listFiles = (dir: string, root = dir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path, root) : [relative(root, path)]
  })

/**
 * The existing package.json wins: the template only adds the scripts,
 * dependencies, and top-level fields it lacks. "type" is the exception:
 * the template's code needs its module type.
 */
export const mergePackageJson = (existing: PackageJson, template: PackageJson): PackageJson => {
  const merged: PackageJson = { ...existing }
  for (const [key, value] of Object.entries(template)) {
    if (MERGED_FIELDS.includes(key)) {
      merged[key] = { ...(value as object), ...(existing[key] as object | undefined) }
    } else if (key === 'type' || !(key in existing)) {
      merged[key] = value
    }
  }
  return merged
}

const fillPlaceholders = (code: string, projectName: string, date: string): string => {
  const name = projectName.toLowerCase().replaceAll(/[^a-z0-9\-_]/g, '-')
  let filled = code.replaceAll(PROJECT_NAME, name)
  for (const [pattern, replace] of COMPATIBILITY_DATES) {
    filled = filled.replace(pattern, replace(date))
  }
  return filled
}

/**
 * Copy a downloaded template into an existing directory. A file that
 * already exists is never overwritten, except package.json, which is
 * merged. The Cloudflare configs count as one file: with wrangler.jsonc
 * in place, the template's cloudflare.config.ts is not added.
 */
export const applyTemplate = (
  templateDir: string,
  targetDir: string,
  packageManager: string,
  date = new Date().toISOString().split('T')[0]
): InitResult => {
  const result: InitResult = { written: [], skipped: [] }
  const targetPackageJson = join(targetDir, 'package.json')
  const existing: PackageJson | undefined = existsSync(targetPackageJson)
    ? JSON.parse(readFileSync(targetPackageJson, 'utf-8'))
    : undefined
  const projectName = typeof existing?.name === 'string' ? existing.name : basename(targetDir)
  const hasConfig = CONFIG_FILES.some((file) => existsSync(join(targetDir, file)))

  for (const file of listFiles(templateDir).sort()) {
    const from = join(templateDir, file)
    const to = join(targetDir, file)
    if (file === 'package.json') {
      const template = JSON.parse(readFileSync(from, 'utf-8'))
      const merged = existing
        ? mergePackageJson(existing, template)
        : { name: projectName, ...template }
      // x-basic runs scripts with the user's package manager
      const json = JSON.stringify(merged, null, 2).replaceAll('$npm_execpath', packageManager)
      writeFileSync(to, `${json}\n`)
      result.written.push(file)
      continue
    }
    if (existsSync(to) || (hasConfig && CONFIG_FILES.includes(file))) {
      result.skipped.push(file)
      continue
    }
    mkdirSync(dirname(to), { recursive: true })
    if (CONFIG_FILES.includes(file)) {
      writeFileSync(to, fillPlaceholders(readFileSync(from, 'utf-8'), projectName, date))
    } else {
      copyFileSync(from, to)
    }
    result.written.push(file)
  }
  return result
}
