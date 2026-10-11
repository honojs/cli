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
