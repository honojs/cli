import { describe, it, expect } from 'vitest'
import { createRouteFilter } from './route-filter'

describe('createRouteFilter', () => {
  it('should pass everything with no patterns', () => {
    const filter = createRouteFilter([], [])
    expect(filter('/')).toBe(true)
    expect(filter('/about')).toBe(true)
  })

  it('should exclude matching paths', () => {
    const filter = createRouteFilter([], ['/api/*'])
    expect(filter('/')).toBe(true)
    expect(filter('/api/data')).toBe(false)
    expect(filter('/api')).toBe(true)
  })

  it('should only pass included paths', () => {
    const filter = createRouteFilter(['/blog/*'], [])
    expect(filter('/blog/hello')).toBe(true)
    expect(filter('/about')).toBe(false)
  })

  it('should apply exclude after include', () => {
    const filter = createRouteFilter(['/blog/*'], ['/blog/draft-*'])
    expect(filter('/blog/hello')).toBe(true)
    expect(filter('/blog/draft-1')).toBe(false)
  })

  it('should not treat regex characters as special', () => {
    const filter = createRouteFilter([], ['/a.b'])
    expect(filter('/a.b')).toBe(false)
    expect(filter('/axb')).toBe(true)
  })
})
