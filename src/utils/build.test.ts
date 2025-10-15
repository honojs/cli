import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('esbuild', () => ({
  build: vi.fn(),
}))

vi.mock('node:url', () => ({
  pathToFileURL: vi.fn(),
}))

vi.mock('node:path', () => ({
  extname: vi.fn(),
}))

import { buildAndImportApp } from './build.js'

describe('buildAndImportApp', () => {
  let mockEsbuild: any
  let mockPathToFileURL: any
  let mockExtname: any

  beforeEach(async () => {
    mockEsbuild = vi.mocked((await import('esbuild')).build)
    mockPathToFileURL = vi.mocked((await import('node:url')).pathToFileURL)
    mockExtname = vi.mocked((await import('node:path')).extname)

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should build and import TypeScript file', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.ts'
    const bundledCode = 'export default app;'

    mockExtname.mockReturnValue('.ts')
    mockEsbuild.mockResolvedValue({
      outputFiles: [{ text: bundledCode }],
    })

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const result = await buildAndImportApp(filePath)

    expect(mockExtname).toHaveBeenCalledWith(filePath)
    expect(mockEsbuild).toHaveBeenCalledWith({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'node20',
      jsx: 'automatic',
      jsxImportSource: 'hono/jsx',
      platform: 'node',
      external: [],
    })
    expect(result).toBe(mockApp)
  })

  it('should build and import JSX file with custom options', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.jsx'
    const bundledCode = 'export default app;'
    const options = {
      external: ['@hono/node-server'],
    }

    mockExtname.mockReturnValue('.jsx')
    mockEsbuild.mockResolvedValue({
      outputFiles: [{ text: bundledCode }],
    })

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const result = await buildAndImportApp(filePath, options)

    expect(mockEsbuild).toHaveBeenCalledWith({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'node20',
      jsx: 'automatic',
      jsxImportSource: 'hono/jsx',
      platform: 'node',
      external: ['@hono/node-server'],
    })
    expect(result).toBe(mockApp)
  })

  it('should build and import TSX file', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.tsx'
    const bundledCode = 'export default app;'

    mockExtname.mockReturnValue('.tsx')
    mockEsbuild.mockResolvedValue({
      outputFiles: [{ text: bundledCode }],
    })

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const result = await buildAndImportApp(filePath)

    expect(mockEsbuild).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoints: [filePath],
        jsx: 'automatic',
        jsxImportSource: 'hono/jsx',
      })
    )
    expect(result).toBe(mockApp)
  })

  it('should directly import JavaScript file without building', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.js'
    const fileUrl = new URL(`file://${filePath}`)

    mockExtname.mockReturnValue('.js')
    mockPathToFileURL.mockReturnValue(fileUrl)

    // Mock dynamic import for JS file
    vi.doMock(fileUrl.href, () => ({ default: mockApp }))

    const result = await buildAndImportApp(filePath)

    expect(mockExtname).toHaveBeenCalledWith(filePath)
    expect(mockPathToFileURL).toHaveBeenCalledWith(filePath)
    expect(mockEsbuild).not.toHaveBeenCalled()
    expect(result).toBe(mockApp)
  })

  it('should handle esbuild errors', async () => {
    const filePath = '/path/to/app.ts'
    const buildError = new Error('Build failed')

    mockExtname.mockReturnValue('.ts')
    mockEsbuild.mockRejectedValue(buildError)

    await expect(buildAndImportApp(filePath)).rejects.toThrow('Build failed')
  })

  it('should handle import errors for JS files', async () => {
    const filePath = '/path/to/nonexistent.js'
    const fileUrl = new URL(`file://${filePath}`)

    mockExtname.mockReturnValue('.js')
    mockPathToFileURL.mockReturnValue(fileUrl)

    // Since we can't easily mock dynamic import, just test with a non-existent module
    // The import will naturally fail
    await expect(buildAndImportApp(filePath)).rejects.toThrow()
  })

  it('should use default empty options when none provided', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.ts'
    const bundledCode = 'export default app;'

    mockExtname.mockReturnValue('.ts')
    mockEsbuild.mockResolvedValue({
      outputFiles: [{ text: bundledCode }],
    })

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    await buildAndImportApp(filePath)

    expect(mockEsbuild).toHaveBeenCalledWith({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'node20',
      jsx: 'automatic',
      jsxImportSource: 'hono/jsx',
      platform: 'node',
      external: [],
    })
  })
})
