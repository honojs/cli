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
}
