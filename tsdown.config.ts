import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: true,
  minify: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  target: false,
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
    }
  }
})
