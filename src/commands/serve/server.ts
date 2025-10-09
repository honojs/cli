import { serve as nodeServe } from '@hono/node-server'

export function serve(options: any, callback?: (info: { port: number }) => void) {
  return nodeServe(options, callback)
}
