# Hono CLI

Hono CLI (`hono`) is a command-line tool for [Hono](https://hono.dev), made for AI coding agents.

It's not a `create-*` command and not a Vite wrapper. It loads your Hono app directly, so an agent can inspect, test, and build the app without starting a server. All commands print JSON by default. Add `--plain` when a human reads the output.

## Installation

> [!NOTE]
> This is the 1.0 release candidate. Try it with `npm install -g @hono/cli@next`. The stable 0.1 is on `latest`.

Install it in your project. Coding agents find it in `package.json`:

```bash
npm install -D @hono/cli
```

Or globally:

```bash
npm install -g @hono/cli
```

To start a Hono app in the current directory, run `hono init` next. See [`init`](#init).

## Usage

```bash
# Show help
hono --help

# Add a Hono app to the current directory
hono init

# Show routes of your Hono app
hono routes

# Send request to Hono app
hono request /

# Run multiple requests from JSONL
hono batch -

# Print the current behavior as batch JSONL lines
hono snapshot

# Measure the performance of your Hono app
hono benchmark

# Generate static files from your Hono app
hono ssg
```

## Commands

Start:

- `init` - Add a Hono app to the current directory

Inspect and test:

- `routes [file]` - Show routes of your Hono app
- `request <path> [file]` - Send request to Hono app using `app.request()`
- `batch <source> [file]` - Run multiple requests from JSONL using `app.request()`
- `snapshot [file]` - Print the current behavior as batch JSONL lines
- `diff` - Show how your uncommitted changes change what the app answers
- `benchmark [file]` - Measure the performance of your Hono app

Build:

- `ssg [file]` - Generate static files from your Hono app

---

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

An app that imports `cloudflare:*` modules (e.g. a Durable Object class from `cloudflare:workers`) works too. Node.js cannot load them, so they are replaced with an empty stub while the routes are read. `snapshot` with `--runtime workerd` or `vite` reads the routes the same way.

### `request`

Send HTTP requests to your Hono application using the built-in `app.request()` method. This is particularly useful for testing and development.

```bash
hono request <path> [file] [options]
```

**Arguments:**

- `path` - Request path, like the URL in curl
- `file` - Path to the Hono app file (TypeScript/JSX supported, optional)

**Options:**

- `-X, --method <method>` - HTTP method (default: GET)
- `-d, --data <data>` - Request body data (`@file` reads a file, `@-` reads stdin)
- `-H, --header <header>` - Custom headers (can be used multiple times)
- `-w, --watch` - Watch for changes and resend request
- `-o, --output <file>` - Write response body to file instead of stdout
- `-O, --remote-name` - Write response body to file named as remote file
- `--plain` - human-readable output instead of JSON
- `--trace` - include matched routes in the output
- `--runtime <runtime>` - runtime to execute the app: `node` (default), `bun`, `deno`, `workerd`, or `vite` (the default in a `cf` project)
- `-i, --include` - Include status and headers in the output (with `--plain`)
- `-I, --head` - Show only status and headers in the output (with `--plain`)
- `--compact` - One-line JSON without the headers
- `--no-bindings` - Skip loading the local Cloudflare bindings
- `-e, --external <package>` - Mark package as external (can be used multiple times)

**Examples:**

```bash
# GET request to the app root (the app is found in src/index.ts or src/index.tsx)
hono request /

# GET request to a path, like curl
hono request /users/123

# POST request with data
hono request /api/users -X POST -d '{"name":"Alice"}'

# Request to a specific app file
hono request /api src/your-app.ts

# Request with custom headers
hono request /api/protected \
  -H 'Authorization: Bearer token' \
  -H 'User-Agent: MyApp' \
  src/your-app.ts

# Request with external packages (useful for Node.js native modules)
hono request / src/your-app.ts -e pg -e dotenv

# Read the request body from stdin
cat payload.json | hono request /api/users -X POST -d @-

# Read the app code from stdin: `app` is predefined and exported for you
echo 'app.get("/hello", (c) => c.json({ ok: true }))' | hono request /hello -

# Debug an unexpected response: which middleware and handler matched?
hono request /api/users/123 --trace

# Run the app on another runtime (it must be installed)
hono request / --runtime bun
hono request / --runtime deno

# Run the app on workerd with your wrangler config: bindings (c.env) are the local ones
hono request /api --runtime workerd

# Send the request through the Vite dev server of the project
hono request /api/hello --runtime vite

```

In a project with a wrangler config, `c.env` carries the real local bindings (KV, D1, R2, vars) automatically — wrangler's `getPlatformProxy` simulates the binding backends while the app runs on Node.js. This works in `request`, `batch`, `snapshot`, and `ssg`; skip it with `--no-bindings`. It does not apply to `--runtime bun`/`deno` (the proxy cannot cross the process boundary) — `--runtime workerd` has the real bindings natively. So `--no-bindings` goes with `--runtime node` only; with another runtime it is an error. It needs [wrangler](https://developers.cloudflare.com/workers/wrangler/) installed in the project (wrangler is not a dependency of Hono CLI — without it, `c.env` stays empty and a note goes to stderr). `cloudflare.config.ts` (the config of the `cf` CLI) is not supported yet: with only that file, `c.env` stays empty with a note on stderr, and `--runtime workerd` fails with `CLOUDFLARE_CONFIG_NOT_SUPPORTED`. With a Vite config, `request`, `batch`, and `snapshot` use `--runtime vite` by default: the Cloudflare Vite plugin reads `cloudflare.config.ts`, so the bindings work. Without one, keep a wrangler config next to it.

`--runtime workerd` runs the whole app inside workerd instead — heavier, but the full runtime. It starts the app with the wrangler config, so pass no file argument. `batch` and `snapshot` take it too; `request` alone also runs on `bun` and `deno`.

`--runtime vite` sends the request through the Vite dev server of the project. Use it for an app that a Vite plugin builds, with no file that exports the Hono app. The dev server starts from the Vite config, so pass no file argument. It listens on a random port on `127.0.0.1` while the command runs. `batch` and `snapshot` take it too. vite must be installed in the project.

In a Vite project with no `src/index.ts` (or `.tsx`, `.js`, `.jsx`) — the app comes from a Vite plugin — `--runtime vite` is the default for `request` and `batch`, so they work with no flag.

In a `cf` project — `cloudflare.config.ts` and a Vite config, no wrangler config — `--runtime vite` is the default, so `c.env` has the bindings with no flag. A file argument, `--no-bindings`, `--trace`, or `--watch` runs the app on Node.js instead: `--trace` and `--watch` need the Hono app itself.

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

A binary response body becomes `"body": null` with `"binary": true` — save it with `-o`. Use `--plain` to print the raw body like curl. A 404 result includes a suggestion to run `--trace`.

### `batch`

Run multiple requests from JSONL in one call, in order, against one app instance — in-memory state carries between steps.

```bash
hono batch <source> [file]
```

**Arguments:**

- `source` - JSONL file, or `-` to read stdin
- `file` - Path to the Hono app file (optional)

**Options:**

- `-H, --header <header>` - Shared headers for every step
- `--compact` - Print only the failed steps and the summary, as one-line JSON
- `--runtime <runtime>` - runtime to execute the app: `node` (default), `workerd`, or `vite` (the default in a `cf` project)
- `--no-bindings` - Skip loading the local Cloudflare bindings
- `-e, --external <package>` - Mark package as external (can be used multiple times)

```bash
hono batch - <<'EOF'
{"path":"/users","expect":{"status":200}}
{"method":"POST","path":"/users","body":{"name":"Momo"},"expect":{"status":201,"body":{"name":"Momo"}},"save":{"id":".id"}}
{"path":"/users/{{id}}","expect":{"status":200}}
{"method":"DELETE","path":"/users/{{id}}","expect":{"status":204}}
EOF
```

With `--runtime workerd`, one workerd starts and every step runs in it, so a flow over the real bindings (put to KV, then get; D1; an AI binding) runs in one call. The entry is `main` in the wrangler config, so pass no file argument. With `--runtime vite`, one Vite dev server starts and every step goes through it.

One JSON object per line: `method`, `path`, `body`, `headers`, `expect`, `save`. `save` stores a value from the response body by dot path, and later steps use it as `{{id}}` (a whole-variable string keeps the saved type). `expect` declares the acceptance criteria: `status` matches exactly, `body` is a deep partial match (declared fields must match, extra response fields are ignored). The output carries the actual `status` and `body`, `pass` per step, and a `summary` — rerun until `failed` is 0. A step without `expect` passes on any 2xx or 3xx and fails on a 4xx or 5xx; to accept a 4xx on purpose, declare it with `expect.status`.

### `snapshot`

Print the current behavior of the app as batch JSONL lines, to stdout — no file is written.

```bash
hono snapshot [file]
```

**Options:**

- `--status-only` - Capture only the status codes, not the bodies
- `--runtime <runtime>` - runtime to execute the app: `node` (default), `workerd`, or `vite` (the default in a `cf` project)
- `--no-bindings` - Skip loading the local Cloudflare bindings
- `-e, --external <package>` - Mark package as external (can be used multiple times)

Paramless GET routes are executed and their actual response becomes the `expect` (`--status-only` captures only the status codes — much smaller on a large app; the probe line keeps its body either way). Param and non-GET routes are printed without one, to fill in. One probe line records the current response for a path that matches no route. Capture before a refactor, then rerun the lines with `hono batch` until `failed` is 0.

Unlike `routes`, this command sends real requests to the app — middleware runs. `routes` never sends a request.

With `--runtime workerd`, the requests go to the app running inside workerd. The routes are read from `main` in the wrangler config in-process, so pass no file argument. With `--runtime vite`, the routes are read from `src/index.ts` and the requests go through the Vite dev server.

### `diff`

Show what your uncommitted changes do to the app: it runs the app at the last commit and as it is now, and compares the answers. Nothing to capture first.

```bash
hono diff [--base <ref>]
```

```json
{
  "base": "HEAD",
  "changed": [{ "route": "GET /admin", "status": "200 -> 303", "body": ["..."] }],
  "added": ["GET /login", "POST /login"],
  "removed": [],
  "compared": 6
}
```

Each side runs `hono snapshot` in a temporary git worktree with fresh local data, so data you wrote while testing does not count. `node_modules` is shared and `.dev.vars` is copied. Paramless GET routes and the 404 probe are compared; param and non-GET routes only show up in `added` and `removed` — check them with `hono batch`. Empty `changed` after a refactor means the GET routes answer as before.

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
- `--no-bindings` - Skip loading the local Cloudflare bindings
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

A page that does not answer 200 is not written. It is listed in `skipped` with its status, so a failing page does not go unnoticed:

```json
{
  "ok": true,
  "data": {
    "output": "static",
    "files": ["static/index.html"],
    "skipped": [{ "path": "/counter", "status": 500 }]
  }
}
```

### `init`

Add a Hono app from a [create-hono](https://github.com/honojs/create-hono) template to the current directory. Use it in a directory you already have, for example right after `npm install -D @hono/cli`.

```bash
hono init [options]
```

**Options:**

- `-i, --install` - install the dependencies
- `-t, --template <template>` - template to use: `aws-lambda`, `bun`, `cloudflare-workers`, `deno`, `fastly`, `lambda-edge`, `netlify`, `nextjs`, `nodejs`, `vercel`, or `x-basic`

```bash
npm install -D @hono/cli
npx hono init --template cloudflare-workers --install
npx hono request /
```

Without `--template`, the template comes from the files in the directory: `wrangler.jsonc` or `cloudflare.config.ts` → `cloudflare-workers`, `deno.json` → `deno`, `bun.lock` → `bun`, `netlify.toml` → `netlify`, `fastly.toml` → `fastly`, `vercel.json` → `vercel`. With no hint, a terminal shows the templates to pick from, like create-hono. Without a terminal (a coding agent), it fails with `TEMPLATE_REQUIRED` and lists them.

A file that already exists is never overwritten; it is listed in `skipped`. `package.json` is merged: the template adds the scripts, dependencies, and fields it lacks, and the existing values win, except `type`, which the template's code needs. The Cloudflare configs count as one file: with a wrangler config in place, the template does not add `cloudflare.config.ts`, and the other way around. `--install` runs the package manager afterwards: it is picked from the lockfile, or from the command that started `hono` (`npx`, `pnpm`, `yarn`, `bunx`), and falls back to npm. Without `--install`, the output says which install command to run.

**Output:**

```json
{
  "ok": true,
  "data": {
    "template": "cloudflare-workers",
    "detectedFrom": "wrangler.jsonc",
    "written": ["package.json", "vite.config.ts"],
    "skipped": ["cloudflare.config.ts", "src/index.ts"],
    "suggestions": ["Install the dependencies: npm install", "Then check the app: hono request /"]
  }
}
```

## Tips

### Using Hono CLI with AI Code Agents

Use the [Hono skill](https://github.com/honojs/skills). It teaches the agent when and how to use Hono CLI, together with Hono best practices.

Without the skill, add one line to your project's `AGENTS.md` or `CLAUDE.md`:

```markdown
Working on this Hono app? Run `hono --help` first and follow it.
```

## Authors

- Yusuke Wada https://github.com/yusukebe
- Taku Amano https://github.com/usualoma

## License

MIT
