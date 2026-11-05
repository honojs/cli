import type { Plugin } from 'esbuild'

const NAMESPACE = 'hono-cli-node-server'

/**
 * Replace `serve` from `@hono/node-server` with one that does not listen.
 * The CLI only needs the app, and the port may be in use by a dev server.
 */
export const noListen: Plugin = {
  name: 'no-listen',
  setup(build) {
    build.onResolve({ filter: /^@hono\/node-server$/ }, ({ path, namespace }) =>
      namespace === NAMESPACE ? { path, external: true } : { path, namespace: NAMESPACE }
    )
    build.onLoad({ filter: /.*/, namespace: NAMESPACE }, () => ({
      contents: `export * from '@hono/node-server'
import { createAdaptorServer } from '@hono/node-server'
export const serve = (options) => createAdaptorServer(options)`,
    }))
  },
}
