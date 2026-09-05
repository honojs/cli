/** Parse repeated `-H 'Key: value'` options into a header record */
export const parseHeaders = (header: string[] | undefined): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const entry of header ?? []) {
    const [key, value] = entry.split(':', 2)
    if (key && value) {
      headers[key.trim()] = value.trim()
    }
  }
  return headers
}
