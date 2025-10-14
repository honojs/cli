# Hono CLI

Hono CLI for Human and AI

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

# Display documentation
hono docs
```

## Commands

- `request [file]` - Send request to Hono app using `app.request()`
- `docs [path]` - Display Hono documentation

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
hono request -P /api/protected -H 'Authorization: Bearer token' -H 'User-Agent: MyApp' src/your-app.ts

# PUT request with data and headers to specific file
hono request -P /api/users/1 -X PUT -d '{"name":"Bob"}' -H 'Content-Type: application/json' src/your-app.ts

# Complex example with multiple options
hono request -P /webhook -X POST -d '{"event":"test"}' -H 'Content-Type: application/json' -H 'X-API-Key: secret' my-project/server.ts
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

### `docs`

Display Hono documentation content directly in your terminal.

```bash
hono docs [path]
```

**Arguments:**

- `path` - Documentation path (optional)

**Examples:**

```bash
# Display main documentation summary (llms.txt)
hono docs

# Display specific documentation pages
hono docs /docs/concepts/motivation
hono docs /docs/guides/best-practices
hono docs /docs/api/context

# Display examples and tutorials
hono docs /examples/stytch-auth
hono docs /examples/basic

# Path normalization (these are equivalent)
hono docs docs/concepts/stacks
hono docs /docs/concepts/stacks
```

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
