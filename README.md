# Hono CLI

CLI for Hono

## Installation

```bash
npm install -g @hono/cli
```

## Usage

```bash
# Show help
hono --help

# Create a new Hono project
hono create

# Open documentation
hono docs

# Send request to Hono app
hono request -P /
```

## Commands

- `create [target]` - Create a new Hono project
- `docs` - Open Hono documentation in browser
- `request [file]` - Send request to Hono app using app.request()

### `create`

Create a new Hono project using [create-hono](https://github.com/honojs/create-hono).

```bash
hono create [target] [options]
```

**Arguments:**

- `target` - Target directory (optional)

**Options:**

- `-t, --template <template>` - Template to use (aws-lambda, bun, cloudflare-workers, cloudflare-workers+vite, deno, fastly, lambda-edge, netlify, nextjs, nodejs, vercel, cloudflare-pages, x-basic)
- `-i, --install` - Install dependencies
- `-p, --pm <pm>` - Package manager to use (npm, bun, deno, pnpm, yarn)
- `-o, --offline` - Use offline mode

**Examples:**

```bash
# Interactive project creation
hono create

# Create project in specific directory
hono create my-app

# Create with Cloudflare Workers template
hono create my-app --template cloudflare-workers

# Create and install dependencies with Bun
hono create my-app --pm bun --install
```

### `docs`

Open Hono documentation in your default browser.

```bash
hono docs
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

**File Support:**

- **TypeScript/JSX files** (`.ts`, `.tsx`, `.jsx`) - Automatically bundled with esbuild
- **JavaScript files** (`.js`) - Imported directly
- **Default paths** - If the file is not found, tries `src/index.ts` and `src/index.tsx` automatically

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
