# Agent DX Log

How measurements from [honojs/agent-dx](https://github.com/honojs/agent-dx)
changed Hono CLI. Newest first.

## 2026-09-03: Onboarding works as a policy, not as a tool list

**Experiment**: `refactor-routes` — split a routes file, keep behavior.
haiku, four onboarding channels, 5 runs each.

**Findings**:

- A devDependency: 0/5 CLI use. The skill: 0/5 activations, under two
  different descriptions. The gate is not the wording — agents open a
  skill when they feel they lack knowledge, and a refactor feels
  self-contained.
- One channel worked: a verification policy in AGENTS.md ("Type
  checking alone cannot catch route regressions. Verify with `npx hono
  routes` or `npx hono request -P <path>`") — 5/5 runs used the CLI.
  A policy with the answer in it beats an introduction of a tool.
- Success stayed at 2/5: the planted bug was a dropped
  `app.notFound()`, and a `hono routes` diff cannot show it — the
  handler is not a route, and from outside the app it is not knowable.
  Only its behavior is.

**Changes**: none in the CLI yet. The winning line is recorded here.
Where it should live — `agent-context`, the README, hono.dev, or the
skill — is an open product decision, and the next experiments run
against the unchanged artifact. Two tries were retracted on the way: a
`routes` field for the handlers (#115 — the notFound handler is not
knowable from outside, only its behavior is), and shipping the line in
`agent-context` (#116, this PR, reduced to this record).
## 2026-09-03: One request per call cannot beat a script — add `--batch`

**Experiment**: `build-endpoints` and the recorded runs across fixtures.

**Findings**:

- To verify N endpoints, agents bundle all checks into one throwaway
  test script and run it in one tool call. `request` costs one call per
  request, so agents that know it still choose the script. The recorded
  scripts always chain state: create with POST, then use the returned
  id in the next request.
- The economics decide: one tool call is one model round trip.

**Changes**: `hono request --batch -` runs many requests from JSONL in
one call, in order, against one app instance. Steps carry state
(`save` a value from a response, use it as `{{name}}` — not `${name}`,
which the shell expands inside an unquoted heredoc). The output is one
result per step: status and body as facts. No `expect` on purpose —
the agent judges anyway, and a status-only `pass: true` would invite
the very false negative `refactor-routes` measured (right status,
wrong body). The throwaway script, without the file or the cleanup.

## 2026-09-03: Agents type curl syntax, hit a dead end, and leave

**Experiment**: `fix-404-shadow` — haiku, baseline vs CLI
(`0.2.0-next.0`) + skill, 5 runs each. The first experiment with full
command recording.

**Findings**:

- A recorded run shows an agent trying to use `request` three times and
  failing on syntax every time: `hono request GET /api/orders`, then
  `hono request "/api/orders"`, then with a guessed `--app` option. It
  gave up and wrote a throwaway test script instead.
- The errors it got were commander's plain text (`error: too many
  arguments`) — outside the JSON envelope, with no suggestion of the
  correct syntax. The moment of highest intent to use the CLI was a
  dead end.

**Changes**:

- `request` now takes the request path as its first argument, like
  the URL in curl: `hono request /api/orders`. The app file moved to
  the optional second argument, and `-P` is gone — one syntax, and no
  guessing between a file and a path.
- A method-like first argument is not interpreted. `hono request GET
  /api/orders` answers with the exact fix in `suggestions`:
  `hono request /api/orders -X GET`. One wrong try, one corrected
  retry — suggestion following is measured at 2/2.
- Argument parse errors (unknown option, bad argument) return the JSON
  envelope with an `INVALID_ARGUMENTS` code and a help suggestion,
  like every other error.
## 2026-09-03: Verification is the home ground — and the competitor is `app.request()` itself (no change yet)

**Experiment**: `build-endpoints` — add a users CRUD to an empty Hono app,
"make sure they work", no tool named. haiku, baseline vs CLI
(`0.2.0-next.0`) + skill, 5 runs each.

**Findings**:

- CLI usage jumped from 0% to 60% (3/5 runs, all `request`). Creation
  plus verification pressure is the natural home of the CLI.
- Efficiency got worse (+220% tokens, one timeout not caused by the
  CLI). n=5, direction only.
- The baseline verified cheaply with hand-written test scripts calling
  `app.request()`. The competitor of `hono request` is not a dev server
  — it is Hono's own testability. The CLI's value concentrates where a
  hand-written script does not reach: workerd bindings, `--trace`,
  zero-setup TS execution, and `benchmark`.

**Follow-up answers**:

- The baseline ran its TS scripts with plain Node — type stripping is on
  by default since Node 22.18, so zero-setup TS execution is no longer a
  CLI differentiator. It still is for JSX (type stripping does not
  handle it, and real Hono apps use `c.html(<... />)` a lot), enums,
  path aliases, and Node below 22.18.
- The timeout run had used the CLI once before hanging. Per-run bash
  logs are now recorded on the agent-dx side, so the next run can tell
  what blocked.

**Workspace hygiene recount** (same runs): 2 of 10 runs left files
behind — a baseline run left `test-api.js`, and a CLI-arm run that did
not use the CLI left `test-users-api.js` plus a stray `src/index.js`
next to the `.ts`. The three runs that used the CLI left nothing.

**Changes**:

- honojs/skills#2: the skill now mentions that `hono request` does the
  same check as a hand-written `app.request()` script, with no file and
  working where plain Node cannot (JSX, enums, path aliases). Worded as
  information, not a prescription: our own numbers say the script
  approach is often cheaper, and the skill serves the agent's outcome,
  not CLI adoption.
- The remaining differentiators of the CLI, after three experiments:
  workerd bindings, `--trace` / `routes` (runtime route resolution),
  JSX-heavy apps, and `benchmark`. A JSX variant of this task can
  measure the third one — noted, behind the shadowing experiment.

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
