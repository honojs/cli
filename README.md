# Hono CLI

Hono CLI is a CLI for Humans and AI who use Hono.

It's not a `create-*` command, not only for dev, build, and deploy, but also not a Vite wrapper. Built on an entirely new concept.

Hono CLI will give you the `hono` command. For Humans, you can use sub-commands specialized for Hono for simple usages. For AI, providing sub-commands to build your Hono application efficiently with AI coding.

## Installation

```bash
npm install -g @hono/cli
```

## Usage

```bash
# Show help
hono --help

# Send request to Hono app
hono request

# Build your Hono app
hono build
```

## Commands

- `request [file]` - Send request to Hono app using `app.request()`
- `build [entry]` - Build your Hono app

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
- `-d, --data <data>` - Request body data
- `-H, --header <header>` - Custom headers (can be used multiple times)
- `-w, --watch` - Watch for changes and resend request
- `-o, --output <file>` - Write response body to file instead of stdout
- `-O, --remote-name` - Write response body to file named as remote file
- `--plain` - human-readable output instead of JSON
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

### `build`

Build your Hono app into a single bundled file.

```bash
hono build [entry] [options]
```

With the `--optimize` option, it also applies Hono-specific optimizations to reduce bundle size:

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
- `--optimize` - apply Hono-specific optimizations
- `--request-body-api-removal <mode>` - Request body API removal mode: `auto` (default), `force`, or `disable`
- `--no-context-response-api-removal` - Disable response utility API removal from Context object
- `--no-hono-api-removal` - Disable Hono API removal optimization
- `--plain` - human-readable output instead of JSON

**Examples:**

```bash
# Build src/index.ts to dist/index.js
hono build

# Build with optimizations
hono build --optimize

# Specify entry file and output file
hono build -o dist/app.js src/app.ts

# Build with minification
hono build -m --optimize
```

**Output:**

The result is JSON. All Hono CLI commands use the same envelope: `ok` and `data` on success, `ok: false` and `error` (with `code`, `message`, and `hint`) on failure with exit code 1.

```json
{
  "ok": true,
  "data": {
    "optimized": true,
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
    "hint": "Pass an existing entry file: hono build src/index.ts"
  }
}
```

Use `--plain` for a human-readable format.

## Tips

### Using Hono CLI with AI Code Agents

When working with AI code agents like Claude Code, you can configure them to use the `hono` CLI for testing. Add the following to your project's `CLAUDE.md` or similar configuration:

````markdown
## Hono Development

Use the `hono` CLI for efficient development. View all commands with `hono --help`.

```bash
# Test your app without starting a server
hono request -P /api/users src/index.ts
hono request -P /api/users -X POST -d '{"name":"Alice"}' src/index.ts
```
````

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
