/**
 * Find a concrete path for a param route, like `/posts/hello` for
 * `/posts/:slug`, from what the app already answered: the links in a
 * page (`href`, `src`, `<loc>`, `<link>`) and the fields of a JSON body.
 * The tool does not invent values; it only reuses ones the app showed.
 */

interface Segment {
  name?: string
  pattern: string
  optional?: boolean
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parseRoute = (path: string): Segment[] =>
  path
    .split('/')
    .slice(1)
    .map((part) => {
      const m = part.match(/^:(\w+)(?:\{(.+)\})?(\?)?$/)
      if (m) {
        return { name: m[1], pattern: m[2] ?? '[^/]+', optional: m[3] === '?' }
      }
      return { pattern: part === '*' ? '.*' : escapeRegExp(part) }
    })

const routeRegExp = (segments: Segment[]) =>
  new RegExp(
    `^${segments
      .map((s) => {
        const part = s.name ? `(${s.pattern})` : s.pattern
        return s.optional ? `(?:/${part})?` : `/${part}`
      })
      .join('')}$`
  )

/** Values for param names, taken from paths and JSON bodies */
export type Values = Map<string, string>

export const isParamRoute = (path: string) => path.includes('/:')

const LINK = /(?:href|src)=["'](\/[^"'#?\s]*)|<(?:loc|link)>(\/[^<#?\s]*)/g

/** Paths the body links to, in order */
export const linksIn = (text: string): string[] =>
  [...text.matchAll(LINK)].map((m) => m[1] ?? m[2]).filter((path) => !path.startsWith('//'))

/** Keep the string and number fields of a JSON body as values, the first one wins */
export const collectValues = (body: unknown, values: Values) => {
  if (Array.isArray(body)) {
    body.forEach((item) => collectValues(item, values))
  } else if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' || typeof value === 'number') {
        if (!values.has(key) && String(value) !== '') {
          values.set(key, String(value))
        }
      } else {
        collectValues(value, values)
      }
    }
  }
}

/**
 * A concrete path for the route: a link that matches it first, then the
 * route with its params filled from known values. Paths in `skip` are
 * not used again.
 */
export const samplePath = (
  route: string,
  links: string[],
  values: Values,
  skip: Set<string>
): string | undefined => {
  const segments = parseRoute(route)
  const re = routeRegExp(segments)
  const names = segments.filter((s) => s.name).map((s) => s.name as string)

  for (const link of links) {
    const m = link.match(re)
    if (m && !skip.has(link)) {
      names.forEach((name, i) => {
        if (m[i + 1] !== undefined && !values.has(name)) {
          values.set(name, decodeURIComponent(m[i + 1]))
        }
      })
      return link
    }
  }

  let filled = ''
  for (const s of segments) {
    if (!s.name) {
      filled += `/${s.pattern === '.*' ? '' : s.pattern.replace(/\\(.)/g, '$1')}`
      continue
    }
    const value = values.get(s.name)
    if (value === undefined || !new RegExp(`^(?:${s.pattern})$`).test(value)) {
      if (s.optional) {
        continue
      }
      return undefined
    }
    filled += `/${encodeURIComponent(value)}`
  }
  return skip.has(filled) ? undefined : filled
}
