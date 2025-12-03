import type { context, PluginBuild } from 'esbuild'
import { Hono } from 'hono'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('esbuild', () => ({
  context: vi.fn(),
}))

vi.mock('node:url', () => ({
  pathToFileURL: vi.fn(),
}))

import { buildAndImportApp } from './build.js'

describe('buildAndImportApp', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEsbuildDispose: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEsbuild: any

  const setupBundledCode = (code: string) => {
    mockEsbuild.mockImplementation((param: Parameters<typeof context>[0]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let onEnd: (result: any) => void
      param.plugins?.[0].setup({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onEnd: (cb: (result: any) => void) => {
          onEnd = cb
        },
      } as PluginBuild)
      onEnd!({ outputFiles: [{ text: code }] })

      return {
        watch: vi.fn(),
        dispose: mockEsbuildDispose,
      }
    })
  }

  beforeEach(async () => {
    mockEsbuildDispose = vi.fn()
    mockEsbuild = vi.mocked((await import('esbuild')).context)

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should build and import TypeScript file', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.ts'
    const bundledCode = 'export default app;'

    setupBundledCode(bundledCode)
    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const buildIterator = buildAndImportApp(filePath)
    const result = (await buildIterator.next()).value

    expect(mockEsbuildDispose).toHaveBeenCalled() // watch: false
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
      plugins: [
        {
          name: 'watch',
          setup: expect.any(Function),
        },
      ],
    })
    expect(result).toBe(mockApp)
  })

  it('should not dispose context when watch is true', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.ts'
    const bundledCode = 'export default app;'

    setupBundledCode(bundledCode)
    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const buildIterator = buildAndImportApp(filePath, { watch: true })
    const result = (await buildIterator.next()).value

    expect(mockEsbuildDispose).not.toHaveBeenCalled() // watch: true
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
      plugins: [
        {
          name: 'watch',
          setup: expect.any(Function),
        },
      ],
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

    setupBundledCode(bundledCode)

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const buildIterator = buildAndImportApp(filePath, options)
    const result = (await buildIterator.next()).value

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
      plugins: [
        {
          name: 'watch',
          setup: expect.any(Function),
        },
      ],
    })
    expect(result).toBe(mockApp)
  })

  it('should build and import TSX file', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.tsx'
    const bundledCode = 'export default app;'

    setupBundledCode(bundledCode)

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const buildIterator = buildAndImportApp(filePath)
    const result = (await buildIterator.next()).value

    expect(mockEsbuild).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoints: [filePath],
        jsx: 'automatic',
        jsxImportSource: 'hono/jsx',
      })
    )
    expect(result).toBe(mockApp)
  })

  it('should handle esbuild errors', async () => {
    const filePath = '/path/to/app.ts'
    const buildError = new Error('Build failed')

    mockEsbuild.mockRejectedValue(buildError)
    const buildIterator = buildAndImportApp(filePath)

    await expect(buildIterator.next()).rejects.toThrow('Build failed')
  })

  it('should use default empty options when none provided', async () => {
    const mockApp = new Hono()
    const filePath = '/path/to/app.ts'
    const bundledCode = 'export default app;'

    setupBundledCode(bundledCode)

    // Mock dynamic import
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`
    vi.doMock(dataUrl, () => ({ default: mockApp }))

    const buildIterator = buildAndImportApp(filePath)
    await buildIterator.next()

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
      plugins: [
        {
          name: 'watch',
          setup: expect.any(Function),
        },
      ],
    })
  })
})
