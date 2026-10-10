import { describe, it, expect } from 'vitest'
import { parseHeaders } from './headers.js'

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
