// Like Void: the plugin builds the Hono app from file-based routes, with no entry file
export default {
  plugins: [
    {
      name: 'void-like',
      resolveId(id) {
        if (id === 'virtual:void-routes') return '\0virtual:void-routes'
      },
      load(id) {
        if (id === '\0virtual:void-routes') {
          return `import { Hono } from 'hono'
const app = new Hono()
app.get('/api/hello', (c) => c.json({ message: 'Hello' }))
export default app`
        }
      },
    },
  ],
}
