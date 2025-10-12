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

# Display documentation
hono docs

# Display specific documentation page
hono docs /docs/concepts/stacks

# Display examples
hono docs /examples/stytch-auth
```

## Commands

- `create [target]` - Create a new Hono project
- `docs [path]` - Display Hono documentation

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

The command fetches and displays Markdown content from the Hono documentation repository, allowing you to read documentation without leaving your terminal.

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
