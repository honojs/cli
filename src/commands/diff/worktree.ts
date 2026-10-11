import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliError } from '../../utils/output.js'

// Ignored files the app needs to run: local secrets
const LOCAL_FILES = ['.dev.vars', '.env']

const git = (cwd: string, args: string[], env?: NodeJS.ProcessEnv): string =>
  execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

/**
 * A commit of the working tree as it is, new files included, made with
 * a temporary index: the user's index, stash, and branches stay as they are.
 */
export const commitWorkingTree = (cwd: string): string => {
  const index = join(mkdtempSync(join(tmpdir(), 'hono-diff-index-')), 'index')
  try {
    const env = { GIT_INDEX_FILE: index }
    git(cwd, ['read-tree', 'HEAD'], env)
    git(cwd, ['add', '-A', '--', git(cwd, ['rev-parse', '--show-toplevel'])], env)
    const tree = git(cwd, ['write-tree'], env)
    return git(cwd, ['commit-tree', tree, '-p', 'HEAD', '-m', 'hono diff'])
  } finally {
    rmSync(join(index, '..'), { recursive: true, force: true })
  }
}

export interface Worktree {
  /** The project directory inside the worktree */
  dir: string
  remove: () => void
}

/**
 * Check out a commit in a temporary worktree, with the project's
 * node_modules linked in and its local secrets copied. Each side starts
 * with fresh local state, so data written while working does not count
 * as a change.
 */
export const addWorktree = (cwd: string, commit: string): Worktree => {
  const root = mkdtempSync(join(tmpdir(), 'hono-diff-'))
  git(cwd, ['worktree', 'add', '--detach', root, commit])
  const dir = join(root, git(cwd, ['rev-parse', '--show-prefix']))
  if (existsSync(join(cwd, 'node_modules'))) {
    symlinkSync(join(cwd, 'node_modules'), join(dir, 'node_modules'), 'junction')
  }
  for (const file of LOCAL_FILES) {
    if (existsSync(join(cwd, file)) && !existsSync(join(dir, file))) {
      copyFileSync(join(cwd, file), join(dir, file))
    }
  }
  return {
    dir,
    remove: () => {
      try {
        git(cwd, ['worktree', 'remove', '--force', root])
      } catch {
        rmSync(root, { recursive: true, force: true })
        git(cwd, ['worktree', 'prune'])
      }
    },
  }
}

/** The commit to compare with, or a CliError when there is none */
export const resolveBase = (cwd: string, ref: string): string => {
  try {
    git(cwd, ['rev-parse', '--show-toplevel'])
  } catch {
    throw new CliError(
      'NOT_A_GIT_REPO',
      'hono diff compares with a git commit, and this is not a git repository',
      {
        suggestions: ['Run git init and commit once, or capture with hono snapshot instead'],
      }
    )
  }
  try {
    return git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`])
  } catch {
    throw new CliError('BASE_NOT_FOUND', `No commit ${ref} to compare with`, {
      suggestions: ['Commit once first, or pass --base <ref>'],
    })
  }
}
