import { describe, it, expect } from 'vitest'
import { section, bullets, steps, codeBlock } from './markdown'

describe('markdown', () => {
  it('should join blocks with blank lines and skip conditional blocks', () => {
    const result = section(1, 'Title', 'First.', false, null, undefined, 'Second.')
    expect(result).toBe('# Title\n\nFirst.\n\nSecond.')
  })

  it('should nest sections', () => {
    const result = section(1, 'Top', section(2, 'Sub', 'Body.'))
    expect(result).toBe('# Top\n\n## Sub\n\nBody.')
  })

  it('should render bullets, steps, and code blocks', () => {
    expect(bullets(['a', 'b'])).toBe('- a\n- b')
    expect(steps(['a', 'b'])).toBe('1. a\n2. b')
    expect(codeBlock('bash', ['echo hi'])).toBe('```bash\necho hi\n```')
  })
})
