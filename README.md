# Hono CLI

Hono CLI (`hono`) is a command-line tool for [Hono](https://hono.dev), made for AI coding agents.

It's not a `create-*` command and not a Vite wrapper. It loads your Hono app directly, so an agent can inspect, test, and build the app without starting a server. All commands print JSON by default. Add `--plain` when a human reads the output.

## Installation

Install it in your project. Coding agents find it in `package.json`:

```bash
npm install -D @hono/cli
```

Or globally:

```bash
npm install -g @hono/cli
```

## Usage

```bash
# Show help
hono --help

# Show how to use Hono CLI, for coding agents
hono agent-context

# Show routes of your Hono app
hono routes

# Send request to Hono app
hono request

# Build an optimized Hono app
hono optimize

# Generate static files from your Hono app
hono ssg

# Measure the performance of your Hono app
hono benchmark
```

## Commands

Start here:

- `agent-context` - Show how to use Hono CLI, for coding agents

Inspect and test:

- `routes [file]` - Show routes of your Hono app
- `request [file]` - Send request to Hono app using `app.request()`
- `benchmark [file]` - Measure the performance of your Hono app

Build:

- `optimize [entry]` - Build an optimized Hono app
- `ssg [file]` - Generate static files from your Hono app

---

### `agent-context`

Show how to use Hono CLI, as Markdown for coding agents. The content is generated from the command definitions, so it always matches the installed version.

```bash
hono agent-context
```

### `routes`

Show all routes of your Hono app, like [`showRoutes()`](https://hono.dev/docs/helpers/dev#showroutes).

```bash
hono routes [file] [options]
```

**Arguments:**

- `file` - Path to the Hono app file (TypeScript/JSX supported, optional)

**Options:**

- `--verbose` - include middleware
- `--plain` - human-readable output instead of JSON
- `-e, --external <package>` - Mark package as external (can be used multiple times)

**Output:**

```json
{
  "ok": true,
  "data": {
    "router": "SmartRouter + RegExpRouter",
    "routes": [
      { "method": "GET", "path": "/", "name": "[handler]", "isMiddleware": false },
      { "method": "POST", "path": "/posts", "name": "[handler]", "isMiddleware": false }
    ]
  }
}
```

### `request`

Send HTTP requests to your Hono application using the built-in `app.request()` method. This is particularly useful for testing and development.

```bash
hono request [file] [options]
```

**Arguments:**

- `file` - Path to the Hono app file (TypeScript/JSX supported, optional)

**Options:**

- `-P, --path <path>` - Request path (default: "/")
- `-X, --method <method>` - HTTP method (default: GET)
- `-d, --data <data>` - Request body data (`@file` reads a file, `@-` reads stdin)
- `-H, --header <header>` - Custom headers (can be used multiple times)
- `-w, --watch` - Watch for changes and resend request
- `-o, --output <file>` - Write response body to file instead of stdout
- `-O, --remote-name` - Write response body to file named as remote file
- `--plain` - human-readable output instead of JSON
- `--trace` - include matched routes in the output
- `--runtime <runtime>` - runtime to execute the app: `node` (default), `bun`, `deno`, or `workerd`
- `-i, --include` - Include status and headers in the output (with `--plain`)
- `-I, --head` - Show only status and headers in the output (with `--plain`)
- `-e, --external <package>` - Mark package as external (can be used multiple times)

**Examples:**

```bash
# GET request to default app root (uses src/index.ts or src/index.tsx)
hono request

# GET request to specific path
hono request -P /users/123

# POST request with data
hono request -P /api/users -X POST -d '{"name":"Alice"}'

# Request to specific file
hono request -P /api src/your-app.ts

# Request with custom headers
hono request -P /api/protected \
  -H 'Authorization: Bearer token' \
  -H 'User-Agent: MyApp' \
  src/your-app.ts

# Request with external packages (useful for Node.js native modules)
hono request -e pg -e dotenv src/your-app.ts

# Read the request body from stdin
cat payload.json | hono request -P /api/users -X POST -d @-

# Read the app code from stdin: `app` is predefined and exported for you
echo 'app.get("/hello", (c) => c.json({ ok: true }))' | hono request - -P /hello

# Debug an unexpected response: which middleware and handler matched?
hono request -P /api/users/123 --trace

# Run the app on another runtime (it must be installed)
hono request -P / --runtime bun
hono request -P / --runtime deno

# Run the app on workerd with your wrangler config: bindings (c.env) are the local ones
hono request -P /api --runtime workerd
```

`workerd` starts the app with the wrangler config of the project, so pass no file argument. It needs [wrangler](https://developers.cloudflare.com/workers/wrangler/) installed in the project. wrangler is not a dependency of Hono CLI.

With `--trace`, the output has `matchedRoutes`. `responded` marks the route that returned the response:

```json
{
  "ok": true,
  "data": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": { "id": "123" },
    "matchedRoutes": [
      { "method": "ALL", "path": "/*", "name": "auth", "isMiddleware": true },
      {
        "method": "GET",
        "path": "/api/users/:id",
        "name": "getUser",
        "isMiddleware": false,
        "responded": true
      }
    ]
  }
}
```

**Output:**

The result is JSON with the shared envelope. A JSON response body is embedded as an object, not an escaped string:

```json
{
  "ok": true,
  "data": {
    "status": 200,
    "headers": {
      "content-type": "application/json"
    },
    "body": { "message": "Hello World" }
  }
}
```

A binary response body becomes `"body": null` with `"binary": true` — save it with `-o`. Use `--plain` to print the raw body like curl.

### `benchmark`

Measure the performance of your Hono app. It is a micro benchmark of routing and handlers: `app.request()` is called directly, with no HTTP stack and no network. Each run happens in a fresh process, so results are comparable.

```bash
hono benchmark [file] [options]
```

**Arguments:**

- `file` - Path to the Hono app file (TypeScript/JSX supported, optional)

**Options:**

- `-P, --path <path>` - benchmark only this path (can be used multiple times)
- `-X, --method <method>` - HTTP method for `-P` paths (default: `GET`)
- `-d, --data <data>` - request body for `-P` paths (`@file` reads a file, `@-` reads stdin)
- `-H, --header <header>` - custom headers for `-P` paths (can be used multiple times)
- `--duration <ms>` - how long to measure each route (default: `500`)
- `--warmup <count>` - requests before measuring (default: `30`)
- `--hono <version-or-path>` - benchmark with this Hono instead (can be used multiple times)
- `--plain` - human-readable output instead of JSON
- `-e, --external <package>` - Mark package as external (can be used multiple times)

**Examples:**

```bash
# Benchmark all GET routes
hono benchmark

# Benchmark one path
hono benchmark -P /users

# Benchmark a POST endpoint
hono benchmark -P /users -X POST -d '{"name":"Alice"}' -H 'Content-Type: application/json'

# Compare two Hono versions with the same app
hono benchmark --hono 4.12.3 --hono 4.13.0

# Compare with a local Hono checkout
hono benchmark --hono ../hono
```

**Output:**

```json
{
  "ok": true,
  "data": {
    "results": [
      {
        "hono": "4.13.0",
        "routes": [
          {
            "method": "GET",
            "path": "/users",
            "requests": 48210,
            "rps": 96420,
            "latency": { "avg": 0.01, "p50": 0.009, "p75": 0.011, "p99": 0.021 }
          }
        ]
      }
    ]
  }
}
```

`--hono` runs the same app with another Hono: an npm version, or a path to a local package. Use it to compare Hono versions without setting up a benchmark environment. Latency is in milliseconds.

### `optimize`

Build your Hono app into a single optimized bundle. For a plain bundle, use your normal build tool — this command exists for the Hono-specific optimizations:

```bash
hono optimize [entry] [options]
```

It applies the following optimizations to reduce bundle size:

- **Router optimization**: Replaces the router with a prebuilt router for your routes
- **Request body API removal**: Removes request body APIs (`c.req.json()`, `c.req.formData()`, etc.) when every route method is strictly GET, HEAD, or OPTIONS. A route or middleware registered with `all()` or `use()` keeps the APIs, because it may read the request body
- **Context response API removal**: Removes unused response utility APIs (`c.body()`, `c.json()`, `c.text()`, `c.html()`, `c.redirect()`) from Context object
- **Hono API removal**: Removes unused Hono methods (`route`, `mount`, `fire`) that are only used during application initialization

**Arguments:**

- `entry` - Entry file for your Hono app (TypeScript/JSX supported, optional)

**Options:**

- `-o, --outfile <outfile>` - Output file
- `-m, --minify` - minify output file
- `-t, --target [target]` - environment target
- `--request-body-api-removal <mode>` - Request body API removal mode: `auto` (default), `force`, or `disable`
- `--no-context-response-api-removal` - Disable response utility API removal from Context object
- `--no-hono-api-removal` - Disable Hono API removal optimization
- `--plain` - human-readable output instead of JSON

**Examples:**

```bash
# Build an optimized bundle to dist/index.js
hono optimize

# Specify entry file and output file
hono optimize -o dist/app.js src/app.ts

# With minification
hono optimize -m

# Control request body API removal
hono optimize --request-body-api-removal force
```

**Output:**

The result is JSON. All Hono CLI commands use the same envelope: `ok` and `data` on success, `ok: false` and `error` on failure with exit code 1. The error has a machine-readable `code`, a `message`, `suggestions` to try in order, and sometimes a `docs` link.

```json
{
  "ok": true,
  "data": {
    "router": "PreparedRegExpRouter",
    "removed": {
      "requestBodyApis": true,
      "contextResponseApis": ["body", "json", "html", "redirect"],
      "honoApis": ["route", "mount", "fire"]
    },
    "output": "dist/index.js",
    "size": 34124
  }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "ENTRY_NOT_FOUND",
    "message": "Entry file missing.ts does not exist",
    "suggestions": [
      "Pass the entry file: hono optimize src/app.ts",
      "Default candidates are src/index.ts, src/index.tsx, src/index.js, and src/index.jsx"
    ]
  }
}
```

Use `--plain` for a human-readable format.

### `ssg`

Generate static files from your Hono app with the [SSG Helper](https://hono.dev/docs/helpers/ssg).

```bash
hono ssg [file] [options]
```

**Arguments:**

- `file` - Path to the Hono app file (TypeScript/JSX supported, optional)

**Options:**

- `-o, --outdir <dir>` - output directory (default: `static`)
- `--include <path>` - generate only matching paths, `*` matches anything (can be used multiple times)
- `--exclude <path>` - skip matching paths, `*` matches anything (can be used multiple times)
- `--plain` - human-readable output instead of JSON
- `-e, --external <package>` - Mark package as external (can be used multiple times)

**Examples:**

```bash
# Generate everything to static/
hono ssg

# Skip API routes
hono ssg --exclude '/api/*'
```

**Output:**

```json
{
  "ok": true,
  "data": {
    "output": "static",
    "files": ["static/index.html", "static/about.html"]
  }
}
```

## Tips

### Using Hono CLI with AI Code Agents

Use the [Hono skill](https://github.com/yusukebe/hono-skill). It teaches the agent when and how to use Hono CLI, together with Hono best practices.

Without the skill, add one line to your project's `AGENTS.md` or `CLAUDE.md`:

```markdown
Working on this Hono app? Run `hono agent-context` first and follow it.
```

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
