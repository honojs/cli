import type { Hono } from 'hono'
import { CliError } from '../../utils/output.js'

export interface StepExpect {
  status?: number
  body?: unknown
}

export interface BatchStep {
  method: string
  path: string
  body?: unknown
  headers?: Record<string, string>
  expect?: StepExpect
  save?: Record<string, string>
}

export interface StepResult {
  method: string
  path: string
  status: number
  body: unknown
  pass: boolean
  expect?: StepExpect
  saved?: Record<string, unknown>
  error?: string
  suggestions?: string[]
}

export interface BatchResult {
  steps: StepResult[]
  summary: { total: number; passed: number; failed: number }
}

const invalid = (message: string): CliError =>
  new CliError('BATCH_INVALID', message, {
    suggestions: [
      'Each line is one JSON object: {"method":"POST","path":"/users","body":{"name":"Momo"},"expect":{"status":201},"save":{"id":".id"}}. A later step uses a saved value as {{id}}',
    ],
  })

/**
 * Parse JSONL batch input. One request per line, empty lines skipped.
 */
export const parseBatch = (input: string): BatchStep[] => {
  const steps: BatchStep[] = []
  const lines = input.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (e) {
      throw invalid(`Line ${i + 1} is not valid JSON: ${e instanceof Error ? e.message : e}`)
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw invalid(`Line ${i + 1} is not a JSON object`)
    }
    const step = parsed as Record<string, unknown>
    if (typeof step.path !== 'string' || !step.path.startsWith('/')) {
      throw invalid(`Line ${i + 1} needs a "path" starting with /`)
    }
    if (step.method !== undefined && typeof step.method !== 'string') {
      throw invalid(`Line ${i + 1}: "method" must be a string`)
    }
    if (step.expect !== undefined && !isValidExpect(step.expect)) {
      throw invalid(
        `Line ${i + 1}: "expect" is an object like {"status":201} or {"status":200,"body":{"name":"Momo"}}`
      )
    }
    if (step.headers !== undefined && !isStringRecord(step.headers)) {
      throw invalid(`Line ${i + 1}: "headers" must be an object of strings`)
    }
    if (step.save !== undefined && !isStringRecord(step.save)) {
      throw invalid(`Line ${i + 1}: "save" must be an object like {"id":".id"}`)
    }
    steps.push({
      method: (step.method ?? 'GET').toString().toUpperCase(),
      path: step.path,
      body: step.body,
      headers: step.headers,
      expect: step.expect as StepExpect | undefined,
      save: step.save,
    })
  }
  if (steps.length === 0) {
    throw invalid('The batch input is empty')
  }
  return steps
}

const isValidExpect = (value: unknown): value is StepExpect => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const expect = value as Record<string, unknown>
  if (expect.status !== undefined && typeof expect.status !== 'number') {
    return false
  }
  return Object.keys(expect).every((key) => key === 'status' || key === 'body')
}

/**
 * Deep partial match, like `toMatchObject`: declared fields must
 * match, extra fields in the actual value are ignored. Arrays match
 * by index and length.
 */
export const matchesSubset = (actual: unknown, expected: unknown): boolean => {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, i) => matchesSubset(actual[i], item))
    )
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      return false
    }
    return Object.entries(expected).every(([key, value]) =>
      matchesSubset((actual as Record<string, unknown>)[key], value)
    )
  }
  return actual === expected
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string')

/**
 * Replace `{{name}}` in every string with a saved variable. Not
 * `${name}`: the shell expands that inside an unquoted heredoc.
 */
export const interpolate = <T>(value: T, vars: Record<string, unknown>): T => {
  if (typeof value === 'string') {
    // A string that is exactly one variable keeps the saved type, so
    // a saved number stays a number in bodies and expects.
    const whole = value.match(/^\{\{(\w+)\}\}$/)
    if (whole) {
      if (!(whole[1] in vars)) {
        throw invalid(`Unknown variable {{${whole[1]}}}. Save it in an earlier step`)
      }
      return vars[whole[1]] as T
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      if (!(name in vars)) {
        throw invalid(`Unknown variable {{${name}}}. Save it in an earlier step`)
      }
      return String(vars[name])
    }) as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolate(v, vars)) as T
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolate(v, vars)
    }
    return result as T
  }
  return value
}

/**
 * Read a value from a parsed body by a dot path like `.user.id` or
 * `.items.0.id`.
 */
export const getByPath = (body: unknown, path: string): unknown => {
  let current: unknown = body
  for (const segment of path.replace(/^\./, '').split('.')) {
    if (segment === '') {
      continue
    }
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Run the steps in order against one app instance, so in-memory state
 * carries from step to step. Each result carries the facts — status
 * and body — and, when the step declares `expect`, the deterministic
 * check against them. Agents miss lines when they compare a spec
 * table by eye, so the comparison belongs to the CLI.
 */
export const runBatch = async (
  app: Hono,
  steps: BatchStep[],
  sharedHeaders: Record<string, string> = {}
): Promise<BatchResult> => {
  const vars: Record<string, unknown> = {}
  const results: StepResult[] = []

  for (const step of steps) {
    const path = interpolate(step.path, vars)
    const headers: Record<string, string> = {
      ...sharedHeaders,
      ...interpolate(step.headers ?? {}, vars),
    }
    const init: RequestInit = { method: step.method, headers }
    if (step.body !== undefined) {
      const body = interpolate(step.body, vars)
      if (typeof body === 'string') {
        init.body = body
      } else {
        init.body = JSON.stringify(body)
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          headers['content-type'] = 'application/json'
        }
      }
    }

    const response = await app.request(new Request(new URL(path, 'http://localhost').href, init))
    const text = await response.text()
    const isJson = response.headers.get('content-type')?.includes('json')
    let body: unknown = text
    if (isJson) {
      try {
        body = JSON.parse(text)
      } catch {
        // keep the text
      }
    }

    const result: StepResult = {
      method: step.method,
      path,
      status: response.status,
      body,
      pass: true,
      ...(step.expect === undefined ? {} : { expect: interpolate(step.expect, vars) }),
    }

    if (result.expect !== undefined) {
      const statusOk =
        result.expect.status === undefined || response.status === result.expect.status
      const bodyOk = result.expect.body === undefined || matchesSubset(body, result.expect.body)
      if (!statusOk || !bodyOk) {
        result.pass = false
        if (response.status === 404) {
          result.suggestions = [`See which routes matched: hono request ${path} --trace`]
        }
      }
    }

    if (step.save) {
      const saved: Record<string, unknown> = {}
      for (const [name, savePath] of Object.entries(step.save)) {
        const value = getByPath(body, savePath)
        if (value === undefined) {
          result.pass = false
          result.error = `save: ${savePath} not found in the body`
        } else {
          vars[name] = value
          saved[name] = value
        }
      }
      if (Object.keys(saved).length > 0) {
        result.saved = saved
      }
    }

    results.push(result)
  }

  const passed = results.filter((r) => r.pass).length
  return {
    steps: results,
    summary: { total: results.length, passed, failed: results.length - passed },
  }
}
