# AGENTS.md

Guide for coding agents working on Hono CLI.

## Project Overview

Hono CLI (`hono`) is a command-line tool for [Hono](https://hono.dev).
We are redesigning it to be AI-first: JSON output by default, commands
made for coding agents, not humans.

## Commands

- `bun install` — install dependencies
- `bun run build` — build (tsdown)
- `bun run watch` — build with auto-rebuild
- `bun run test` — run tests (Vitest)
- `bun run format:fix && bun run lint:fix` — fix format and lint

Runtime: Node.js 20+. Package manager: Bun.

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
   bun run format:fix && bun run lint:fix
   bun run test
   bun run build
   ```

4. Commit with conventional commits: `<type>(<scope>): <description>`.
   Example: `feat(request): add --runtime option`
5. Open a PR against `main`. Keep the body short:

   ```markdown
   What and why, in a few sentences.

   - short bullet points, only when needed (e.g. test results, notes)
   ```

   No fixed section labels. Write it like a human note.

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

## Hono Documentation

Need Hono details? Fetch <https://hono.dev/llms.txt> or a page under
`https://hono.dev/docs/...`.

## Maintaining This File

Keep this file simple, short, and correct. If reality changes, update
this file in the same PR.
