import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addWorktree, commitWorkingTree, resolveBase } from './worktree'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()

const repo = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hono-diff-test-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'test')
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n.dev.vars\n')
  writeFileSync(join(dir, 'app.ts'), 'v1')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')
  return dir
}

describe('diff worktrees', () => {
  it('checks out the last commit and the working tree, new files included', () => {
    const dir = repo()
    writeFileSync(join(dir, 'app.ts'), 'v2')
    writeFileSync(join(dir, 'new.ts'), 'new')
    writeFileSync(join(dir, '.dev.vars'), 'SECRET=1')
    mkdirSync(join(dir, 'node_modules'))

    const base = addWorktree(dir, resolveBase(dir, 'HEAD'))
    const current = addWorktree(dir, commitWorkingTree(dir))
    try {
      expect(readFileSync(join(base.dir, 'app.ts'), 'utf-8')).toBe('v1')
      expect(existsSync(join(base.dir, 'new.ts'))).toBe(false)
      expect(readFileSync(join(current.dir, 'app.ts'), 'utf-8')).toBe('v2')
      expect(readFileSync(join(current.dir, 'new.ts'), 'utf-8')).toBe('new')
      expect(readFileSync(join(current.dir, '.dev.vars'), 'utf-8')).toBe('SECRET=1')
      expect(existsSync(join(current.dir, 'node_modules'))).toBe(true)
    } finally {
      base.remove()
      current.remove()
    }
    // The user's repository is left as it was
    expect(git(dir, 'status', '--short')).toBe('M app.ts\n?? new.ts')
    expect(git(dir, 'worktree', 'list').split('\n')).toHaveLength(1)
    expect(git(dir, 'stash', 'list')).toBe('')
  })

  it('fails with a clear error outside git or before the first commit', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hono-diff-test-')))
    expect(() => resolveBase(dir, 'HEAD')).toThrowError(/not a git repository/)
    git(dir, 'init', '-q')
    expect(() => resolveBase(dir, 'HEAD')).toThrowError(/No commit HEAD/)
  })
})
