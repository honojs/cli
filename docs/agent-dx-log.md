# Agent DX Log

How measurements from [honojs/agent-dx](https://github.com/honojs/agent-dx)
changed Hono CLI. Newest first.

## 2026-09-03: Route count does not matter — locality does (no change)

**Experiment**: `fix-404-large` — the same double-prefix mount bug in a
27-route shop API. haiku, baseline vs CLI (`0.2.0-next.0`) + skill,
5 runs each.

**Findings**:

- Both arms 100% success. The CLI arm cost more tokens (+24%) and used
  the CLI in 0/5 runs — down from 2/5 on the small fixture.
- The hypothesis "more routes make exploring expensive" was wrong: the
  404 path `/api/orders` maps straight to `routes/orders.ts`, so one
  grep lands on the right file. Route count never mattered.

**Changes**: none. The sharpened hypothesis instead: `routes` and
`--trace` are structurally needed when the bug is **not local** — when
the file the path points to is correct, and the cause lives elsewhere
(route shadowing: an earlier wildcard, an early-returning middleware, a
mount typo).

**Next measurement**: a route-shadowing fixture, in two variants — a 404
(measures the #108 suggestion) and a wrong 200 (measures discovery
without it). Then `next.0` vs `next.1` on that ground.

## 2026-09-02: Agents never discover `--trace` — suggest it on a 404 (#108)

**Experiment**: the `fix-404` task on haiku. Four conditions — nothing /
CLI as a devDependency / CLI + an AGENTS.md line / CLI + the hono skill —
with 5 runs each, then 10 more runs for the skill condition.

**Findings**:

- Only the skill made agents use the CLI (2/5 runs). A devDependency
  (0/5) and an AGENTS.md line (0/5) did not. Agents do not go looking
  for tools on their own.
- No run called `agent-context` (0/20). Agents skip the manual and run
  commands directly. One explorer used `--help` as the entry.
- Agents used `request` heavily (11 calls) but never found `--trace` —
  on a 404 debugging task.
- The one run that hit an error envelope followed its `suggestions` and
  recovered (1/1). Just-in-time guidance works; up-front reading does not.

**Changes**:

- #108: a 404 result of `hono request` now carries a suggestion to run
  `--trace`. Put the pointer where agents already are, instead of
  expecting them to read the manual first.
- Not changed: `agent-context` stays, but we now see it as a reference
  for the deep features, not as a mandatory entry. More changes wait for
  the next experiment.

**Next measurement**: `0.2.0-next.1` (with #108) against `next.0`, on a
larger fixture (~30 routes) where reading the source is expensive.
