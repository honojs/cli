import { describe, it, expect } from 'vitest'
import { bodyContentType, csrfHint, parseHeaders, withBodyType } from './headers.js'

describe('bodyContentType', () => {
  it('is JSON for an object or array, a form otherwise', () => {
    expect(bodyContentType('{"title":"milk"}')).toBe('application/json')
    expect(bodyContentType('[1]')).toBe('application/json')
    expect(bodyContentType('title=milk')).toBe('application/x-www-form-urlencoded')
    expect(bodyContentType('123')).toBe('application/x-www-form-urlencoded')
  })
})

describe('withBodyType', () => {
  it('keeps a content-type the user set', () => {
    expect(withBodyType({ 'Content-Type': 'text/csv' }, 'a,b')).toEqual({
      'Content-Type': 'text/csv',
    })
    expect(withBodyType({}, 'a=b')).toEqual({ 'content-type': 'application/x-www-form-urlencoded' })
    expect(withBodyType({}, undefined)).toEqual({})
  })
})

describe('csrfHint', () => {
  const form = { 'content-type': 'application/x-www-form-urlencoded' }
  it('points at sec-fetch-site on a 403 to a form POST', () => {
    expect(csrfHint(403, 'POST', form)).toContain('sec-fetch-site: same-origin')
    expect(csrfHint(403, 'POST', { ...form, 'sec-fetch-site': 'same-origin' })).toBeUndefined()
    expect(csrfHint(403, 'POST', { 'content-type': 'application/json' })).toBeUndefined()
    expect(csrfHint(403, 'GET', form)).toBeUndefined()
    expect(csrfHint(401, 'POST', form)).toBeUndefined()
  })
})

describe('parseHeaders', () => {
  it('keeps a value with colons, like a URL', () => {
    expect(parseHeaders(['Origin: http://localhost:8787', 'X-Time: 12:30'])).toEqual({
      Origin: 'http://localhost:8787',
      'X-Time': '12:30',
    })
  })

  it('skips an entry without a name or a value', () => {
    expect(parseHeaders([': x', 'X-Empty:', 'no-colon'])).toEqual({})
  })
})
