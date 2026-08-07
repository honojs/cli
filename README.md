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

# Generate an optimized Hono app
hono optimize
```

## Commands

- `request [file]` - Send request to Hono app using `app.request()`
- `optimize [entry]` - Generate an optimized Hono app

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
- `-J, --json` - Output response as JSON
- `-o, --output <file>` - Write to file instead of stdout
- `-O, --remote-name` - Write output to file named as remote file
- `-i, --include` - Include protocol and headers in the output
- `-I, --head` - Show only protocol and headers in the output
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

**Response Format:**

The command returns a JSON object with the following structure:

```json
{
  "status": 200,
  "body": "{\"message\":\"Hello World\"}",
  "headers": {
    "content-type": "application/json",
    "x-custom-header": "value"
  }
}
```

### `optimize`

Generate an optimized Hono class and export bundled file.

This command automatically applies the following optimizations to reduce bundle size:

- **Request body API removal**: Removes request body APIs (`c.req.json()`, `c.req.formData()`, etc.) when your application only uses GET, HEAD, or OPTIONS methods
- **Context response API removal**: Removes unused response utility APIs (`c.body()`, `c.json()`, `c.text()`, `c.html()`, `c.redirect()`) from Context object
- **Hono API removal**: Removes unused Hono methods (`route`, `mount`, `fire`) that are only used during application initialization

```bash
hono optimize [entry] [options]
```

**Arguments:**

- `entry` - Entry file for your Hono app (TypeScript/JSX supported, optional)

**Options:**

- `-o, --outfile <outfile>` - Output file
- `-m, --minify` - minify output file
- `-t, --target [target]` - environment target
- `--no-request-body-api-removal` - Disable request body API removal optimization
- `--no-context-response-api-removal` - Disable response utility API removal from Context object
- `--no-hono-api-removal` - Disable Hono API removal optimization

**Examples:**

```bash
# Generate an optimized Hono class and export bundled file to dist/index.js
hono optimize

# Specify entry file and output file
hono optimize -o dist/app.js src/app.ts

# Export bundled file with minification
hono optimize -m

# Specify environment target
hono optimize -t es2024

# Disable specific optimizations
hono optimize -m --no-request-body-api-removal
hono optimize -m --no-context-response-api-removal
hono optimize -m --no-hono-api-removal
```

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
