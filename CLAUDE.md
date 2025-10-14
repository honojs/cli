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

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Package Manager**: Bun
- **Build Tool**: tsup
- **Testing Framework**: Vitest
- **Linter**: ESLint + Prettier
- **CI/CD**: GitHub Actions
