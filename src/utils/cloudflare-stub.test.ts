import * as esbuild from 'esbuild'
import { describe, expect, it } from 'vitest'
import { stubCloudflareModules } from './cloudflare-stub'

describe('stubCloudflareModules', () => {
  it('should let an app that imports cloudflare:* load on Node.js', async () => {
    const result = await esbuild.build({
      stdin: {
        contents: `
          import { DurableObject, env } from 'cloudflare:workers'
          import { connect } from 'cloudflare:sockets'
          export class Counter extends DurableObject {}
          export const names = [typeof Counter, typeof env, typeof connect]
        `,
        loader: 'js',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      plugins: [stubCloudflareModules],
    })
    const code = result.outputFiles[0].text
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    )
    expect(module.names).toEqual(['function', 'function', 'function'])
  })
})
