import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getFilenameFromPath, saveFile } from './file'

describe('getFilenameFromPath', () => {
  it('should extract filename from simple path', () => {
    expect(getFilenameFromPath('/foo/bar.txt')).toBe('bar.txt')
  })

  it('should extract filename from path with query params', () => {
    expect(getFilenameFromPath('/foo/bar.txt?baz=qux')).toBe('bar.txt')
  })

  it('should extract filename from path ending with slash', () => {
    expect(getFilenameFromPath('/foo/bar/')).toBe('bar')
  })

  it('should extract filename from path with hostname', () => {
    expect(getFilenameFromPath('http://example.com:8080/foo/bar.txt')).toBe('bar.txt')
  })
})

describe('saveFile', () => {
  const tmpDir = join(tmpdir(), 'hono-cli-file-test-' + Date.now())

  beforeEach(() => {
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir)
    }
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('should save file correctly', async () => {
    const filename = 'test.txt'
    const filepath = join(tmpDir, filename)
    const content = new TextEncoder().encode('Hello, World!')

    await saveFile(content.buffer, filepath)

    expect(existsSync(filepath)).toBe(true)
    expect(readFileSync(filepath, 'utf-8')).toBe('Hello, World!')
  })

  it('should throw error if file already exists', async () => {
    const filename = 'existing.txt'
    const filepath = join(tmpDir, filename)
    const content = new TextEncoder().encode('foo')

    // Create dummy file
    await saveFile(content.buffer, filepath)

    await expect(saveFile(content.buffer, filepath)).rejects.toThrow(
      `File ${filepath} already exists.`
    )
  })

  it('should throw error if directory does not exist', async () => {
    const filepath = join(tmpDir, 'non/existent/dir/file.txt')
    const content = new TextEncoder().encode('foo')

    await expect(saveFile(content.buffer, filepath)).rejects.toThrow(
      `Directory ${resolve(tmpDir, 'non/existent/dir')} does not exist.`
    )
  })
})
