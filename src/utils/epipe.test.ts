import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { ignoreEpipe } from './epipe'

const errorWithCode = (code: string) => Object.assign(new Error(code), { code })

describe('ignoreEpipe', () => {
  it('ignores EPIPE', () => {
    const stream = new EventEmitter()
    ignoreEpipe(stream)
    expect(() => stream.emit('error', errorWithCode('EPIPE'))).not.toThrow()
  })

  it('rethrows other errors', () => {
    const stream = new EventEmitter()
    ignoreEpipe(stream)
    expect(() => stream.emit('error', errorWithCode('EIO'))).toThrowError('EIO')
  })
})
