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

# Display documentation
hono docs

# Display specific documentation page
hono docs /docs/concepts/stacks

# Display examples
hono docs /examples/stytch-auth
```

## Commands

- `docs [path]` - Display Hono documentation

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
