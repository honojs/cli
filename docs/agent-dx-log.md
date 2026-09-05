# Agent DX Log

How measurements from [honojs/agent-dx](https://github.com/honojs/agent-dx)
changed Hono CLI. Newest first.

## 2026-09-05: `expect` returns — measurement beats our reasoning

**Experiment**: an auto-mode task (build a shop API against an
acceptance spec table), script vs hybrid vs CLI-only, 3 runs each.

**Findings**: CLI-only was the fastest and cheapest (76k tokens, 48s)
but lost runs the same way every condition did: the agent compared
the spec table against the batch facts by eye and missed a line.
Deterministic comparison across many lines is exactly what agents are
bad at. We removed `expect` from `--batch` on reasoning (#114 — "the
agent judges anyway"); the measurement says otherwise.

**Changes**: `expect` is back, stronger: `{"status":201}` and/or
`{"body":{...}}` — the body check is a deep partial match, which
answers the original objection (a status-only pass hides a wrong
body). Steps report `pass`, the batch reports a `summary` — the spec
table becomes an executable check file, rerun until `failed` is 0.

## 2026-09-04: A verbatim example halves the tokens again

**Experiment**: `build-endpoints` x `next.3` + the skill example
(honojs/skills#4). 5 runs.

**Findings**: error runs 4/5 → 2/5 (the rest recovered via the #120
flag hints), median CLI calls 2 → 1, median tokens 87k → 56k — a
cumulative -59% since before `--batch`. The median run is one
`--batch` call, zero errors, ~30s. The only change was the example,
so the gain belongs to it: agents copy examples verbatim.

**Changes**: none — this closes the `--batch` funnel work.

## 2026-09-04: One skill line takes `--batch` from 0/40 to 5/5

**Experiment**: `build-endpoints` x `next.2`, old skill vs
honojs/skills#3 (the one `--batch` line). 5 runs each.

**Findings**: adoption 0/5 → 5/5, median CLI calls 5 → 2, median
tokens -36%. A feature off the rails does not exist; on them, it is
used at once. 4/5 first batch calls hit an envelope error and all
recovered — agents invented flags (`--body`, `-j`, `-m`) and guessed
JSONL field names.

**Changes**: unknown-option suggestions now map the common wrong
guesses to the real flag (`--body`/`-j` → `-d`, `-m` → `-X`), like
the `-P` migration hint. The skill gets a verbatim batch example
(honojs/skills#4) — agents copy examples exactly, so a real one
removes the guessing.
## 2026-09-04: The loop closes — the next line measured end to end

**Experiment**: `build-endpoints` x skill re-measured on each release
(haiku, 5 runs each), after the `next.0` vs `next.1` A/B.

**Findings**: success / CLI usage went `next.0` 0.6 / 0.4 (2 hangs) →
`next.1` 0.8 / 1.0 (1 hang) → `next.2` 1.0 / 0.8 (0 hangs).
`refactor-routes` with the policy line: 5/5, the notFound failure
class gone. Every envelope error in the runs was recovered from (4/4).

**Changes**: none — this entry records that the ones above worked.
The one open item is `--batch`: 0 adoptions in 40 runs until the
skill mentions it (honojs/skills#3).

## 2026-09-04: A failed build must fail, not hang

**Experiment**: the `next.0` vs `next.1` A/B (haiku, 35 runs) — the
first with the new CLI. Plus a recorded reproduction.

**Findings**:

- 3 of 35 runs were lost to a 600s timeout: `hono request` printed the
  esbuild error and then never exited. A build failure (an unresolved
  import — routine while developing) logged the error but never
  resolved the internal promise, and the esbuild watch context kept
  the process alive. Agent environments keep stdin open, so nothing
  saved them.
- For an agent the worst failure is not a wrong error — it is a silent
  hang. An error envelope is recovered from 4/4 times; a hang eats the
  whole run.

**Changes**: a failed one-shot build now rejects: `BUILD_FAILED` (with
the esbuild message) or `INVALID_APP`, as the JSON envelope with exit
code 1, and the esbuild context is disposed. `--watch` keeps the old
behavior: log and wait for the next change.

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
