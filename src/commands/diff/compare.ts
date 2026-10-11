import { subsetDiff } from '../batch/batch.js'

interface SnapshotLine {
  method?: string
  path: string
  expect?: { status?: number; body?: unknown }
}

export interface Change {
  route: string
  /** "200 -> 401" */
  status?: string
  /** One line per difference in the body */
  body?: string[]
}

export interface DiffResult {
  changed: Change[]
  added: string[]
  removed: string[]
  /** Routes run on both sides (paramless GET routes and the 404 probe) */
  compared: number
}

const routeKey = (line: SnapshotLine) => `${line.method ?? 'GET'} ${line.path}`

export const parseLines = (output: string): SnapshotLine[] =>
  output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as SnapshotLine)

/** A text body: where the two start to differ, with a little context */
const textDiff = (before: string, after: string): string[] => {
  let i = 0
  while (i < before.length && before[i] === after[i]) {
    i++
  }
  const at = Math.max(0, i - 20)
  const cut = (s: string) => JSON.stringify(s.slice(at, i + 40))
  return [`body: differs at character ${i}: ${cut(before)} -> ${cut(after)}`]
}

const bodyDiff = (before: unknown, after: unknown): string[] => {
  if (typeof before === 'string' && typeof after === 'string') {
    return before === after ? [] : textDiff(before, after)
  }
  // Both directions: changed or missing fields, then fields only in the new body
  const lines = subsetDiff(after, before)
  const added = subsetDiff(before, after).filter((line) => line.endsWith(': missing'))
  return [...lines, ...added.map((line) => line.replace(': missing', ': added'))]
}

/**
 * Compare two snapshots of the same app. Only lines with an "expect"
 * (paramless GET routes and the 404 probe) carry behavior; the others
 * only say that a route exists.
 */
export const compareSnapshots = (base: SnapshotLine[], current: SnapshotLine[]): DiffResult => {
  const before = new Map(base.map((line) => [routeKey(line), line]))
  const after = new Map(current.map((line) => [routeKey(line), line]))
  const result: DiffResult = { changed: [], added: [], removed: [], compared: 0 }

  for (const [key, line] of before) {
    const next = after.get(key)
    if (!next) {
      result.removed.push(key)
      continue
    }
    if (!line.expect || !next.expect) {
      continue
    }
    result.compared++
    const change: Change = { route: key }
    if (line.expect.status !== next.expect.status) {
      change.status = `${line.expect.status} -> ${next.expect.status}`
    }
    const body = bodyDiff(line.expect.body, next.expect.body)
    if (body.length > 0) {
      change.body = body
    }
    if (change.status || change.body) {
      result.changed.push(change)
    }
  }
  for (const key of after.keys()) {
    if (!before.has(key)) {
      result.added.push(key)
    }
  }
  return result
}
