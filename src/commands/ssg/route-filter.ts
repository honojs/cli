// Path patterns for --include / --exclude. `*` matches anything.

const toRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

export const createRouteFilter = (
  include: string[],
  exclude: string[]
): ((pathname: string) => boolean) => {
  const includeRegExps = include.map(toRegExp)
  const excludeRegExps = exclude.map(toRegExp)

  return (pathname) => {
    if (includeRegExps.length > 0 && !includeRegExps.some((r) => r.test(pathname))) {
      return false
    }
    return !excludeRegExps.some((r) => r.test(pathname))
  }
}
