# @hono/cli

CLI for Hono

## Installation

```bash
npm install -g @hono/cli
```

## Usage

```bash
# Show help
hono --help

# Say hello
hono hello

# Say hello to someone
hono hello yusuke

# Start development server
hono serve

# Start server with specific file
hono serve src/app.ts

# Start server with middleware
hono serve --use 'logger()' --use 'cors()'

# Start server and show routes
hono serve --show-routes

# Open documentation in browser
hono docs
```

## Commands

- `hello [name]` - Say hello (default: Hono)
- `serve [entry]` - Start development server
  - `[entry]` - Entry file (default: `./src/index.ts`)
  - `-p, --port <port>` - Port number (default: 3000)
  - `--show-routes` - Show registered routes
  - `--use <middleware>` - Use built-in middleware (can be used multiple times)
- `docs` - Open Hono documentation in browser

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
