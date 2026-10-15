import * as happyDom from 'happy-dom'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { browse, rewriteRegexLiterals } from './browser.js'

const page = (body: string) =>
  `<!doctype html><html><head><title>Test</title></head><body>${body}</body></html>`

const app = () => {
  const app = new Hono()
  app.get('/', (c) =>
    c.html(
      page(`
        <p id="out">${c.req.query('added') ?? 'none'}</p>
        <button id="more">More</button>
        <form method="post" action="/items">
          <label>Title <input name="title" /></label>
          <input placeholder="Note" />
          <button type="submit">Add</button>
        </form>
        <script>
          document.getElementById('more').addEventListener('click', () => {
            document.getElementById('out').textContent = 'clicked'
          })
        </script>
      `)
    )
  )
  app.post('/items', async (c) => {
    const { title } = await c.req.parseBody()
    return c.redirect(`/?added=${title}`, 303)
  })
  app.get('/module', (c) =>
    c.html(page('<p id="out">waiting</p><script type="module" src="/m.js"></script>'))
  )
  app.get('/m.js', (c) => {
    c.header('content-type', 'text/javascript')
    // happy-dom's module loader fails on this regex as is
    return c.body(
      "const f = (s) => !/^[/\\\\]{2}/.test(s)\ndocument.getElementById('out').textContent = 'module ' + f('a')\nexport { f }"
    )
  })
  app.get('/errors', (c) =>
    c.html(
      page(`<p id="out">start</p>
        <script>
          fetch('https://example.com/').then((r) => {
            document.getElementById('out').textContent = 'other origin ' + r.status
          })
          throw new Error('boom')
        </script>`)
    )
  )
  return app
}

describe('browse', () => {
  it('runs the page script and clicks', async () => {
    const result = await browse(happyDom, app(), '/', [{ type: 'click', target: '#more' }])
    expect(result.url).toBe('/')
    expect(result.title).toBe('Test')
    expect(result.text).toContain('clicked')
    expect(result.actions).toEqual([{ action: 'click #more', ok: true }])
  })

  it('fills fields by name, label, or placeholder, submits, and follows the redirect', async () => {
    const before = await browse(happyDom, app(), '/', [
      { type: 'fill', target: 'Title', value: 'milk' },
      { type: 'fill', target: 'Note', value: 'cold' },
    ])
    expect(before.forms).toEqual([
      { action: '/items', method: 'POST', fields: { title: 'milk', Note: 'cold' } },
    ])

    const after = await browse(happyDom, app(), '/', [
      { type: 'fill', target: 'title', value: 'milk' },
      { type: 'click', target: 'button[type=submit]' },
    ])
    expect(after.url).toBe('/?added=milk')
    expect(after.text).toContain('milk')
  })

  it('stops at an action that finds nothing', async () => {
    const result = await browse(happyDom, app(), '/', [
      { type: 'fill', target: 'nothing', value: 'x' },
      { type: 'click', target: '#more' },
    ])
    expect(result.actions).toEqual([
      {
        action: 'fill nothing=x',
        ok: false,
        error: expect.stringContaining('No field called nothing'),
      },
    ])
  })

  it('loads a module with a regex that happy-dom cannot parse', async () => {
    const result = await browse(happyDom, app(), '/module', [])
    expect(result.text).toBe('module true')
  })

  it('records page errors and blocks other origins', async () => {
    const result = await browse(happyDom, app(), '/errors', [])
    expect(result.console).toContainEqual({ type: 'error', text: expect.stringContaining('boom') })
    expect(result.text).toBe('other origin 403')
  })
})

describe('rewriteRegexLiterals', () => {
  it('turns regex literals into new RegExp()', async () => {
    const out = await rewriteRegexLiterals('const f = (s) => !/^[/\\\\]{2}/g.test(s) / 2')
    expect(out).toBe('const f = (s) => !(new RegExp("^[/\\\\\\\\]{2}", "g")).test(s) / 2')
  })

  it('keeps code it cannot parse', async () => {
    expect(await rewriteRegexLiterals('const =')).toBe('const =')
  })
})
