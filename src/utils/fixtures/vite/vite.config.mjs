// An app that only exists inside the Vite dev server, like one built by a plugin
export default {
  plugins: [
    {
      name: 'app',
      configureServer(server) {
        server.middlewares.use(async (req, res) => {
          if (req.url === '/cookies') {
            res.setHeader('set-cookie', ['a=1', 'b=2'])
            res.end()
            return
          }
          if (req.url === '/redirect') {
            res.writeHead(302, { location: '/' })
            res.end()
            return
          }
          let body = ''
          for await (const chunk of req) {
            body += chunk
          }
          // Through the Vite logger (an app in workerd) and console.log (an app in this process)
          server.config.logger.info('from app')
          console.log('from app console')
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, body })
          )
        })
      },
    },
  ],
}
