import { describe, it, expect } from 'vitest'
import { compareSnapshots, parseLines } from './compare'

describe('compareSnapshots', () => {
  it('lists routes that answer differently, and routes added or removed', () => {
    const base = parseLines(
      [
        '{"path":"/","expect":{"status":200,"body":"<h1>Posts</h1>"}}',
        '{"path":"/admin","expect":{"status":200,"body":"<h1>Admin</h1>"}}',
        '{"path":"/api/posts","expect":{"status":200,"body":{"posts":[],"total":0}}}',
        '{"path":"/posts/:slug"}',
        '{"method":"POST","path":"/old"}',
      ].join('\n')
    )
    const current = parseLines(
      [
        '{"path":"/","expect":{"status":200,"body":"<h1>Posts</h1>"}}',
        '{"path":"/admin","expect":{"status":303,"body":""}}',
        '{"path":"/api/posts","expect":{"status":200,"body":{"posts":[],"next":null}}}',
        '{"path":"/posts/:slug"}',
        '{"method":"POST","path":"/login"}',
      ].join('\n')
    )
    expect(compareSnapshots(base, current)).toEqual({
      changed: [
        {
          route: 'GET /admin',
          status: '200 -> 303',
          body: ['body: differs at character 0: "<h1>Admin</h1>" -> ""'],
        },
        {
          route: 'GET /api/posts',
          body: ['body.total: missing', 'body.next: added'],
        },
      ],
      added: ['POST /login'],
      removed: ['POST /old'],
      compared: 3,
    })
  })

  it('is empty when nothing changed', () => {
    const lines = parseLines('{"path":"/","expect":{"status":200,"body":{"ok":true}}}')
    expect(compareSnapshots(lines, lines)).toEqual({
      changed: [],
      added: [],
      removed: [],
      compared: 1,
    })
  })
})
