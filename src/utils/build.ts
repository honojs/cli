import * as esbuild from 'esbuild'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface BuildOptions {
  external?: string[]
}

/**
 * Build and import a TypeScript/JSX/JS file as an app
 */
export async function buildAndImportApp(filePath: string, options: BuildOptions = {}) {
  const ext = extname(filePath)

  // TypeScript/JSX files need transformation and bundling
  if (['.ts', '.tsx', '.jsx'].includes(ext)) {
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'node20',
      jsx: 'automatic',
      jsxImportSource: 'hono/jsx',
      platform: 'node',
      external: options.external || [],
    })

    // Execute the bundled code using data URL
    const code = result.outputFiles[0].text
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    const module = await import(dataUrl)
    return module.default
  } else {
    // Regular JS files can be imported directly
    const module = await import(pathToFileURL(filePath).href)
    return module.default
  }
}
