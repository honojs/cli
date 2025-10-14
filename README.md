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

# Display documentation
hono docs

# Search documentation
hono search middleware

# Send request to Hono app
hono request

# Start server
hono serve
```

## Commands

- `docs [path]` - Display Hono documentation
- `search [query]` - Search Hono documentation
- `request [file]` - Send request to Hono app using `app.request()`
- `serve [entry]` - Start server for Hono app

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

### `search`

Search through Hono documentation using fuzzy search powered by Algolia.

```bash
hono search <query> [options]
```

**Arguments:**

- `query` - Search query (required)

**Options:**

- `-l, --limit <number>` - Number of results to show (default: 5, max: 20)

**Examples:**

```bash
# Search for middleware documentation
hono search middleware

# Search with custom result limit
hono search "getting started" --limit 10

# Search for specific topics
hono search jwt
hono search "cors middleware"
hono search routing
```

**Search Results:**

Each result includes:

- **Title** - The documentation page title with search terms highlighted
- **Category** - Hierarchical path showing the document structure
- **URL** - Direct link to the documentation page
- **Command** - Corresponding `hono docs` command to view the content locally

Example output:

```
1. Middleware ​
   Category: Middleware ​
   URL: https://hono.dev/docs/guides/middleware#middleware
   Command: hono docs /docs/guides/middleware

2. Third-party Middleware - Hono
   Category: Third-party Middleware - Hono > Middleware
   URL: https://hono.dev/docs/middleware/third-party#VPSidebarNav
   Command: hono docs /docs/middleware/third-party
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

### `serve`

Start a server for your Hono application. This is a simple server specialized for Hono applications with built-in TypeScript and JSX support.

```bash
hono serve [entry] [options]
```

**Arguments:**

- `entry` - Entry file for your Hono app (TypeScript/JSX supported, optional)

**Options:**

- `-p, --port <port>` - Port number (default: 7070)
- `--show-routes` - Show registered routes
- `--use <middleware>` - Use middleware (can be used multiple times)

**Examples:**

```bash
# Start server with default empty app (no entry file needed)
hono serve

# Start server on specific port
hono serve -p 8080 src/app.ts

# Start server with specific entry file
hono serve src/app.ts

# Start server and show routes
hono serve --show-routes src/app.ts

# Start server with middleware
hono serve --use 'cors()' src/app.ts

# Start server with multiple middleware
hono serve --use 'cors()' --use 'logger()' src/app.ts

# Start server with authentication and static file serving
hono serve --use 'basicAuth({username:"foo", password:"bar"})' --use "serveStatic({ root: './' })"

# Combine all options
hono serve -p 8080 --show-routes --use 'cors()' --use 'logger()' src/app.ts
```

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
