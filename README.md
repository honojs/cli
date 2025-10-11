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
```

## Commands

- `create [target]` - Create a new Hono project
- `docs` - Open Hono documentation in browser

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

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
