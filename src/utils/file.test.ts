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

  it('should return "index" if the path is root', () => {
    expect(getFilenameFromPath('/')).toBe('index')
  })

  it.each([
    ['application/json', 'index.json'],
    ['text/html', 'index.htm'],
    ['text/plain', 'index.txt'],
    ['application/xml', 'index.xml'],
    ['text/html; charset=utf-8', 'index.htm'],
    ['charset=UTF-8; application/json; boundary=something', 'index.json'],
    ['image/png', 'index.png'],
    ['image/jpeg', 'index.jpeg'],
    ['image/webp', 'index.webp'],
    ['audio/mpeg', 'index.mp3'],
    ['video/mp4', 'index.mp4'],
    ['application/pdf', 'index.pdf'],
    ['application/zip', 'index.zip'],
    ['text/css', 'index.css'],
    ['text/javascript', 'index.js'],
    ['application/wasm', 'index.wasm'],
    ['foo=bar; image/avif', 'index.avif'],
    ['audio/aac', 'index.aac'],
    ['video/x-msvideo', 'index.avi'],
    ['video/av1', 'index.av1'],
    ['application/octet-stream', 'index.bin'],
    ['image/bmp', 'index.bmp'],
    ['text/csv', 'index.csv'],
    ['application/vnd.ms-fontobject', 'index.eot'],
    ['application/epub+zip', 'index.epub'],
    ['image/gif', 'index.gif'],
    ['application/gzip', 'index.gz'],
    ['image/x-icon', 'index.ico'],
    ['text/calendar', 'index.ics'],
    ['application/ld+json', 'index.jsonld'],
    ['audio/x-midi', 'index.mid'],
    ['video/mpeg', 'index.mpeg'],
    ['audio/ogg', 'index.oga'],
    ['video/ogg', 'index.ogv'],
    ['application/ogg', 'index.ogx'],
    ['audio/opus', 'index.opus'],
    ['font/otf', 'index.otf'],
    ['application/rtf', 'index.rtf'],
    ['image/svg+xml', 'index.svg'],
    ['image/tiff', 'index.tif'],
    ['video/mp2t', 'index.ts'],
    ['font/ttf', 'index.ttf'],
    ['video/webm', 'index.webm'],
    ['audio/webm', 'index.weba'],
    ['application/manifest+json', 'index.webmanifest'],
    ['font/woff', 'index.woff'],
    ['font/woff2', 'index.woff2'],
    ['application/xhtml+xml', 'index.xhtml'],
    ['video/3gpp', 'index.3gp'],
    ['video/3gpp2', 'index.3g2'],
    ['model/gltf+json', 'index.gltf'],
    ['model/gltf-binary', 'index.glb'],
    ['unknown/type', 'index'],
  ])('given content-type "%s", should return "%s"', (contentType, expected) => {
    expect(getFilenameFromPath('/', contentType)).toBe(expected)
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
