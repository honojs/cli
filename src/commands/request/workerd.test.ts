import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CliError } from '../../utils/output'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { findWranglerConfig, runOnWorkerd } from './workerd'

const getMockExistsSync = async () => vi.mocked((await import('node:fs')).existsSync)

describe('findWranglerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should pick the first existing candidate', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockImplementation((path) => String(path).endsWith('wrangler.jsonc'))
    expect(findWranglerConfig()).toBe('wrangler.jsonc')
  })

  it('should return undefined without a config', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(false)
    expect(findWranglerConfig()).toBeUndefined()
  })
})

describe('runOnWorkerd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fail with WRANGLER_CONFIG_NOT_FOUND without a config', async () => {
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(false)
    const promise = runOnWorkerd({ path: '/', method: 'GET', headers: {} })
    await expect(promise).rejects.toThrowError(CliError)
    await expect(promise).rejects.toMatchObject({ code: 'WRANGLER_CONFIG_NOT_FOUND' })
  })

  it('should fail with WRANGLER_NOT_FOUND when wrangler is not installed', async () => {
    // This repo has a config (mocked) but no wrangler dependency
    const existsSync = await getMockExistsSync()
    existsSync.mockReturnValue(true)
    const promise = runOnWorkerd({ path: '/', method: 'GET', headers: {} })
    await expect(promise).rejects.toMatchObject({ code: 'WRANGLER_NOT_FOUND' })
  })
})
