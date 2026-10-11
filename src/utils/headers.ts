/** Parse repeated `-H 'Key: value'` options into a header record */
export const parseHeaders = (header: string[] | undefined): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const entry of header ?? []) {
    // Split at the first colon only: values like URLs have more
    const i = entry.indexOf(':')
    const key = entry.slice(0, i).trim()
    const value = entry.slice(i + 1).trim()
    if (i > 0 && key && value) {
      headers[key] = value
    }
  }
  return headers
}

/**
 * The content-type for a string body without one, like curl's `-d`: a
 * form, or JSON when the body is a JSON object or array. fetch would
 * send text/plain, which `c.req.parseBody()` and validators ignore.
 */
export const bodyContentType = (body: string): string => {
  try {
    const value: unknown = JSON.parse(body)
    if (typeof value === 'object' && value !== null) {
      return 'application/json'
    }
  } catch {
    // not JSON
  }
  return 'application/x-www-form-urlencoded'
}

/** Add the content-type for a string body, unless the headers set one */
export const withBodyType = (
  headers: Record<string, string>,
  body: unknown
): Record<string, string> =>
  typeof body !== 'string' || Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
    ? headers
    : { ...headers, 'content-type': bodyContentType(body) }

/**
 * Hono's csrf() answers 403 to a form POST without Origin or
 * Sec-Fetch-Site. A browser sends them; a CLI request does not, so
 * point at the header instead of leaving the agent to guess.
 */
export const csrfHint = (
  status: number,
  method: string,
  headers: Record<string, string>
): string | undefined => {
  const header = (name: string) =>
    Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1]
  const isForm = /form|text\/plain/.test(header('content-type') ?? '')
  return status === 403 &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
    isForm &&
    header('origin') === undefined &&
    header('sec-fetch-site') === undefined
    ? 'If the app uses csrf(), a form POST needs the header a browser sends: "sec-fetch-site: same-origin"'
    : undefined
}
