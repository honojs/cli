# Hono CLI Development Guidelines

This file documents the development guidelines and design decisions for Hono CLI.

## Architecture Guidelines

### Command Structure

- Each command is placed in `src/commands/{command}/index.ts`
- Related logic is organized within the same directory
- Complex features are properly modularized

### File Separation Principles

- **Separation by Function**: e.g., built-in middleware map separated into `builtin-map.ts`
- **Testability**: Parts that can be benchmarked or tested independently become standalone modules
- **Reusability**: Components that can be used by other features are made common

## Design Decisions

### Testing Strategy

- **Vitest** used (fast, full TypeScript support)
- **Type Safety**: Minimize use of `any`
- **Mocking**: Proper type definitions for test reliability
- **Test Execution**: Run tests with `bun run test`

### Build Tools

- **Bun** as main package manager
- **tsup** for building
- **Production Build**: Use `bun run build` for production builds
- **Development Build**: Use `bun run watch` for development with auto-rebuild
- **esbuild** used in serve command (TypeScript/JSX transformation)

### Code Quality

- **ESLint + Prettier** for code quality maintenance
- **Format and Lint Fix**: Use `bun run format:fix && bun run lint:fix` to automatically fix formatting and linting issues
- **GitHub Actions** for CI/CD (Node.js 20, 22, 24 support)
- **Type Safety** focused implementation

## Development Principles

1. **Simplicity**: Avoid overly complex implementations
2. **Modularity**: Properly separate features for easy testing and reuse
3. **Type Safety**: Maximize TypeScript benefits
4. **Performance**: Focus on optimization, especially for compile command
5. **Developer Experience**: Aim for developer-friendly CLI
6. **Consistency**: Always refer to projects under <https://github.com/honojs> for implementation patterns and conventions
7. **Documentation**: Always update README when adding or modifying features

## Hono Documentation Reference

When you need information about Hono framework, APIs, or middleware, use the following CLI commands:

### Quick Documentation Access

- **`hono docs`** - Display main documentation summary
- **`hono docs <path>`** - View specific documentation pages directly in terminal
- **`hono search <query>`** - Search through Hono documentation with keyword matching

### Common Usage Examples

```bash
# Search for specific topics
hono search middleware
hono search "getting started"
hono search jwt
hono search cors

# View specific documentation
hono docs /docs/api/context
hono docs /docs/guides/middleware
hono docs /docs/concepts/routing
hono docs /examples/basic

# Get overview of all Hono features
hono docs
```

### URL Path Conversion

For efficient documentation access from web URLs, convert paths using the following rule:

- `https://hono.dev/docs/middleware/builtin/basic-auth` → `hono docs /docs/middleware/builtin/basic-auth`
- `https://hono.dev/docs/api/context` → `hono docs /docs/api/context`
- `https://hono.dev/examples/basic` → `hono docs /examples/basic`

Simply remove the `https://hono.dev` portion and append the path to the `hono docs` command to access documentation directly in the terminal.

### Recommended Workflow

1. **Search first**: Use `hono search <keyword>` to find relevant documentation
2. **View locally**: Use the provided `hono docs` command from search results to read full content
3. **Reference online**: Use the URL from search results for detailed browsing if needed

This approach ensures you have quick access to accurate, up-to-date Hono information without leaving the terminal.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Package Manager**: Bun
- **Build Tool**: tsup
- **Testing Framework**: Vitest
- **Linter**: ESLint + Prettier
- **CI/CD**: GitHub Actions
