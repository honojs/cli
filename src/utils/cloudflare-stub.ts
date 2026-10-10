import type { Plugin } from 'esbuild'

/**
 * Every named import from the stub is this empty class, so
 * `class Counter extends DurableObject {}` and `env.FOO` load fine.
 * A missing name resolves through the prototype, which is a Proxy.
 */
const STUB = `
class Stub {}
module.exports = Object.create(new Proxy({}, { get: () => Stub }))
`

/**
 * Replace `cloudflare:*` modules (`cloudflare:workers` and others) with
 * an empty stub. Node.js cannot load them, so an app that defines a
 * Durable Object fails to import. Use it only to read the routes: no
 * request runs against the stubbed app.
 */
export const stubCloudflareModules: Plugin = {
  name: 'stub-cloudflare-modules',
  setup(build) {
    build.onResolve({ filter: /^cloudflare:/ }, (args) => ({
      path: args.path,
      namespace: 'cloudflare-stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'cloudflare-stub' }, () => ({
      contents: STUB,
      loader: 'js',
    }))
  },
}
