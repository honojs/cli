# AGENTS.md

Guidance for coding agents working on Hono CLI.

## Project Overview

Hono CLI (`hono`) is a command-line tool for [Hono](https://hono.dev).
It is being redesigned to be AI-first: JSON output by default, commands
designed for coding agents rather than humans.

## Commands

- `bun install` — install dependencies
- `bun run build` — production build (tsdown)
- `bun run watch` — development build with auto-rebuild
- `bun run test` — run tests (Vitest)
- `bun run format:fix && bun run lint:fix` — auto-fix formatting and lint issues

Runtime: Node.js 20+. Package manager: Bun.

## Architecture

- Each command lives in `src/commands/{command}/index.ts`
- Logic that can be tested independently is split into its own module
  (e.g. `builtin-map.ts`)
- Shared utilities live in `src/utils/`

## Code Rules

- TypeScript, type-safe: do not introduce `any`
- Simplicity first: the least complex implementation that works.
  Over-engineering is a defect
- Behavior changes require Vitest tests that fail without the change
- Adding or changing a feature requires a README update in the same PR
- Follow implementation patterns from other projects under
  <https://github.com/honojs>

## Pull Request Workflow

1. Branch from latest `main`: `<type>/<short-slug>` where `<type>` is
   `feat` / `fix` / `chore` / `docs` / `refactor`
2. Implement, following the rules above
3. Quality gates — all must pass locally before opening a PR:

   ```bash
   bun run format:fix && bun run lint:fix
   bun run test
   bun run build
   ```

4. Commit with conventional commits: `<type>(<scope>): <description>`
   — e.g. `feat(request): add --runtime option`
5. Open a PR against `main`. Keep the body short:

   ```markdown
   What and why, in a few sentences.

   - How it was verified
   ```

   Add `Closes #<n>` only when an issue exists.

6. Self-review the full diff against the review checklist below before
   handing off

**No AI attribution.** AI use in this repo is assumed and self-evident —
do not add `Co-Authored-By` trailers, session links, or "Generated with
..." lines to commit messages or PR bodies. Commits are authored by the
configured git user only.

One PR = one concern. Never force-push a branch under review.

## Review Checklist

When reviewing a PR (or self-reviewing), verify the quality gates pass
locally, then check:

- **Correctness** — does it do what was asked? Edge cases (empty input,
  binary data, watch mode, Windows paths)?
- **Tests** — do behavior changes have tests that fail without the change?
- **Type safety** — no new `any`, including in tests
- **Simplicity** — flag over-engineering explicitly
- **Docs** — README updated for feature changes
- **Breaking changes** — removed/renamed flags, output format changes.
  Not necessarily wrong, but must be called out
- **Conventions** — command structure, commit style, short PR body with
  a test plan, no AI attribution

Verdict is one of: **approve** / **request changes** (findings ranked
most-severe first, with `file:line`) / **needs human decision** (state
the question crisply). Label findings `blocker` / `bug` / `risk` / `nit`.
Don't inflate nits.

## Hono Documentation

When you need Hono framework details, fetch <https://hono.dev/llms.txt>
(or the specific page under `https://hono.dev/docs/...`).

## Maintaining This File

Keep this file accurate. When reality drifts from it (commands, tools,
workflow), update AGENTS.md in the same PR. Proposals to improve this
file are always welcome.
