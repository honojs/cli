# AGENTS.md

Guide for coding agents working on Hono CLI.

## Project Overview

Hono CLI (`hono`) is a command-line tool for [Hono](https://hono.dev).
We are redesigning it to be AI-first: JSON output by default, commands
made for coding agents, not humans.

## Commands

- `pnpm install` — install dependencies
- `pnpm run build` — build (tsdown)
- `pnpm run watch` — build with auto-rebuild
- `pnpm run test` — run tests (Vitest)
- `pnpm run format:fix && pnpm run lint:fix` — fix format and lint

Runtime: Node.js 22+. Package manager: pnpm.

## Architecture

- Each command is in `src/commands/{command}/index.ts`
- Split testable logic into small modules (e.g. `builtin-map.ts`)
- Shared code is in `src/utils/`

## Code Rules

- TypeScript. No `any`
- Keep it simple. The simplest code that works is the best
- A behavior change needs a test that fails without the change
- A feature change needs a README update in the same PR
- Write short, simple English in docs, comments, commits, and PRs
- Follow patterns from other <https://github.com/honojs> projects

## Pull Request Workflow

1. Branch from latest `main`: `<type>/<short-slug>`. `<type>` is
   `feat` / `fix` / `chore` / `docs` / `refactor`
2. Implement
3. Run the quality gates. All must pass:

   ```bash
   pnpm run format:fix && pnpm run lint:fix
   pnpm run test
   pnpm run build
   ```

4. Commit with conventional commits: `<type>(<scope>): <description>`.
   Example: `feat(request): add --runtime option`
5. Open a PR against `main`. Keep the body short:

   ```markdown
   What and why, in a few sentences.
   ```

   No fixed section labels. Write it like a human note.
   Add notes the checklist does not cover as plain sentences.
   Use bullets only when there are several items.

   Add `Closes #<n>` only if an issue exists.

   End the body with the checklist from
   `.github/pull_request_template.md`. Check the items you did.

6. Self-review the diff with the checklist below

**No AI attribution.** Do not add `Co-Authored-By`, session links, or
"Generated with ..." to commits or PR bodies.

One PR = one concern. Do not force-push a branch under review.

## Review Checklist

Run the quality gates first. Then check:

- **Correctness** — does it do what was asked? Check edge cases
- **Tests** — does a behavior change have a test that fails without it?
- **Type safety** — no new `any`, including tests
- **Simplicity** — flag over-engineering
- **Docs** — README updated?
- **Breaking changes** — call them out
- **Conventions** — command structure, commit style, short PR body,
  no AI attribution

Verdict: **approve** / **request changes** / **needs human decision**.
Rank findings by severity: `blocker` / `bug` / `risk` / `nit`.

## Release

1. On `main`: `pnpm run release` (`np --no-publish` — bumps the version,
   tags, pushes, and creates a GitHub release). It is interactive, so a
   human runs it in a terminal
2. The tag push triggers the `release` workflow, which stages the
   package on npm with staged publishing
3. A maintainer approves the staged package on npmjs.com (needs 2FA)

A prerelease (a version like `0.2.0-next.0`) publishes to the `next`
dist-tag, so `latest` does not move. Users opt in with
`npm install @hono/cli@next`. Release it from the `next` branch with
`pnpm run release --any-branch`.

## Agent DX Log

When a measurement from honojs/agent-dx changes the CLI, record it in
`docs/agent-dx-log.md` in the same PR: the experiment, the findings,
and the change.

## Hono Documentation

Need Hono details? Fetch <https://hono.dev/llms.txt> to find the right
page, then fetch the page with the `Accept: text/markdown` header to
get Markdown.

```bash
curl -H 'Accept: text/markdown' https://hono.dev/docs/routing
```

## Maintaining This File

Keep this file simple, short, and correct. If reality changes, update
this file in the same PR.
