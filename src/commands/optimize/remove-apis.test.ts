import { describe, it, expect, vi } from 'vitest'
import { removeApis } from './remove-apis'

const source = `var HonoRequest = class {
  routeIndex = 0;
  #cachedBody = (key) => {
    return key;
  };
  json() {
    return this.#cachedBody("json");
  }
  text() {
    return this.#cachedBody("text");
  }
  param(key) {
    return key;
  }
};
`

describe('removeApis', () => {
  it('should remove the listed members', () => {
    const result = removeApis(source, 'HonoRequest', ['json', 'text', '#cachedBody'])
    expect(result).not.toContain('#cachedBody')
    expect(result).not.toContain('json()')
    expect(result).not.toContain('text()')
    expect(result).toContain('param(key)')
  })

  it('should skip removal if a removed private member is still referenced', () => {
    // `text()` is not listed, like a method added in a newer hono
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = removeApis(source, 'HonoRequest', ['json', '#cachedBody'])
    expect(result).toBe(source)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('should return contents as-is if the class does not match', () => {
    const result = removeApis(source, 'Context', ['json', '#cachedBody'])
    expect(result).toBe(source)
  })
})
