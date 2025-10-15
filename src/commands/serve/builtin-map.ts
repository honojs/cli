// Built-in imports mapping based on official documentation
export const builtinMap: Record<string, string> = {
  // Authentication
  basicAuth: 'hono/basic-auth',
  bearerAuth: 'hono/bearer-auth',

  // Security & Validation
  csrf: 'hono/csrf',
  secureHeaders: 'hono/secure-headers',
  jwt: 'hono/jwt',
  jwk: 'hono/jwk',

  // Request/Response Processing
  cors: 'hono/cors',
  etag: 'hono/etag',
  compress: 'hono/compress',
  prettyJSON: 'hono/pretty-json',
  bodyLimit: 'hono/body-limit',
  combine: 'hono/combine',
  contextStorage: 'hono/context-storage',
  methodOverride: 'hono/method-override',
  trailingSlash: 'hono/trailing-slash',

  // Utilities & Performance
  cache: 'hono/cache',
  timeout: 'hono/timeout',
  poweredBy: 'hono/powered-by',

  // Logging & Monitoring
  logger: 'hono/logger',
  timing: 'hono/timing',
  requestId: 'hono/request-id',

  // Internationalization
  language: 'hono/language',

  // Access Control
  ipRestriction: 'hono/ip-restriction',

  // Rendering
  jsxRenderer: 'hono/jsx-renderer',

  // Static Files (Node.js specific)
  serveStatic: '@hono/node-server/serve-static',

  // Helpers - Accepts
  accepts: 'hono/accepts',

  // Helpers - Adapter
  env: 'hono/adapter',
  getRuntimeKey: 'hono/adapter',

  // Helpers - Connection Info (Node.js specific)
  getConnInfo: '@hono/node-server/conninfo',

  // Helpers - Cookie
  getCookie: 'hono/cookie',
  getSignedCookie: 'hono/cookie',
  setCookie: 'hono/cookie',
  setSignedCookie: 'hono/cookie',
  deleteCookie: 'hono/cookie',

  // Helpers - CSS
  css: 'hono/css',
  rawCssString: 'hono/css',
  viewTransition: 'hono/css',
  createCssContext: 'hono/css',
  createCssMiddleware: 'hono/css',

  // Helpers - HTML
  html: 'hono/html',
  raw: 'hono/html',

  // Helpers - JWT (different from middleware)
  sign: 'hono/jwt',
  verify: 'hono/jwt',
  decode: 'hono/jwt',

  // Helpers - Proxy
  proxy: 'hono/proxy',

  // Helpers - Streaming
  stream: 'hono/streaming',
  streamText: 'hono/streaming',
  streamSSE: 'hono/streaming',
}
