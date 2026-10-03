import { describe, expect, test } from 'claude-code/testing'

import { CONFIG } from '../hooks/register'

type Node = { type: string; props?: Record<string, unknown>; children?: (Node | string)[] }

const walk = (n: Node | string, out: Node[] = []): Node[] => {
  if (typeof n !== 'string') {
    out.push(n)
    n.children?.forEach(c => walk(c, out))
  }
  return out
}

const textOf = (n: Node | string): string =>
  typeof n === 'string' ? n : (n.children ?? []).map(textOf).join('')

const color = (name: string) => CONFIG.colors[name]

describe('md-render', () => {
  const draw = async ($: any, text: unknown) => {
    const ui = await $.ui.mount({
      plugin: 'md-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text, isFirstOfReply: false },
    })
    return (await ui.drawn()) as Node
  }

  const styled = (tree: Node, match: Record<string, unknown>) =>
    walk(tree).filter(n => n.type === 'Text' && Object.entries(match).every(([k, v]) => n.props?.[k] === v))

  test('heading is bold purple', async $ => {
    const hit = styled(await draw($, '# Title'), { bold: true, color: color('purple') })
    expect(hit.map(textOf)).toContain('Title')
  })

  test('bold is bold orange', async $ => {
    const hit = styled(await draw($, 'a **big** b'), { bold: true, color: color('orange') })
    expect(hit.map(textOf)).toEqual(['big'])
  })

  test('italic is italic amber', async $ => {
    const hit = styled(await draw($, 'a *soft* b'), { italic: true, color: color('amber') })
    expect(hit.map(textOf)).toEqual(['soft'])
  })

  test('***bold italic*** is bold and italic', async $ => {
    const hit = styled(await draw($, 'a ***both*** b'), { bold: true, italic: true })
    expect(hit.map(textOf)).toEqual(['both'])
    expect(walk(await draw($, 'a ***both*** b')).map(textOf).join('')).not.toContain('*')
  })

  test('bold nests italic and the reverse', async $ => {
    const tree = await draw($, '**a *b* c** and *d **e** f*')
    expect(styled(tree, { bold: true, italic: true }).map(textOf)).toEqual(['b', 'e'])
    expect(walk(tree).map(textOf).join('')).not.toContain('*')
  })

  test('~~strikethrough~~ is struck', async $ => {
    const hit = styled(await draw($, 'a ~~gone~~ b'), { strikethrough: true })
    expect(hit.map(textOf)).toEqual(['gone'])
  })

  test('unclosed *** and ~~ mid-stream stay plain text', async $ => {
    for (const src of ['x ***half', 'x ~~half']) {
      const tree = await draw($, src)
      expect(styled(tree, { strikethrough: true })).toHaveLength(0)
      expect(styled(tree, { bold: true })).toHaveLength(0)
      expect(walk(tree).map(textOf).join('')).toContain(src)
    }
  })

  test('a trailing backslash is kept as text', async $ => {
    expect(walk(await draw($, 'path C:\\')).map(textOf).join('')).toContain('C:\\')
    expect(walk(await draw($, 'path C:\\')).map(textOf).join('')).not.toContain('undefined')
  })

  test('inline code is green', async $ => {
    const hit = styled(await draw($, 'run `make test` now'), { color: color('green') })
    expect(hit.map(textOf)).toEqual(['make test'])
  })

  const native = (tree: Node) => walk(tree).filter(n => n.type === 'Markdown')

  test('fenced code is handed to the native Markdown unparsed', async $ => {
    const fence = '```ts\nconst a = **x**\n```'
    const tree = await draw($, `before\n\n${fence}\n\nafter`)
    expect(native(tree).map(n => n.props?.text)).toEqual([fence])
    expect(walk(tree).map(textOf).join('')).toContain('before')
  })

  test('list has orange markers beside nested content', async $ => {
    const tree = await draw($, '- one\n  - two\n2. three')
    const markers = styled(tree, { color: color('orange') }).map(textOf)
    expect(markers).toEqual([`${CONFIG.glyphs.bullet} `, `${CONFIG.glyphs.bullet} `, '2. '])
    const indented = walk(tree).filter(n => n.type === 'Box' && n.props?.paddingLeft === CONFIG.indent)
    expect(indented).toHaveLength(1)
    expect(textOf(indented[0])).toContain('two')
  })

  test('quote has a dim bar and italic content', async $ => {
    const tree = await draw($, '> wise words')
    expect(styled(tree, { dimColor: true }).map(textOf)).toEqual([`${CONFIG.glyphs.quoteBar} `])
    expect(styled(tree, { italic: true }).map(textOf)).toContain('wise words')
  })

  test('unclosed ** mid-stream stays plain text', async $ => {
    const tree = await draw($, 'start **half-typed')
    expect(styled(tree, { bold: true })).toHaveLength(0)
    expect(walk(tree).map(textOf).join('')).toContain('start **half-typed')
  })

  test('unclosed fence mid-stream stays plain text', async $ => {
    const tree = await draw($, '```ts\nconst a = 1')
    expect(styled(tree, { color: color('green') })).toHaveLength(0)
    expect(walk(tree).map(textOf).join('')).toContain('```ts')
  })

  const TABLE = '| Style | Example |\n|---|---:|\n| Bold | **Important** |'

  test('complete table is handed to the native Markdown', async $ => {
    const tree = await draw($, `intro\n\n${TABLE}`)
    expect(native(tree).map(n => n.props?.text)).toEqual([TABLE])
  })

  test('table without a delimiter row yet stays plain text', async $ => {
    const tree = await draw($, '| Style | **Example** |')
    expect(native(tree)).toHaveLength(0)
    expect(styled(tree, { bold: true })).toHaveLength(0)
    expect(walk(tree).map(textOf).join('')).toContain('| Style | **Example** |')
  })

  test('unreadable text falls back to next(e)', async ($, on) => {
    on('ui.render', { component: 'AssistantMessage' }, () => ({ type: 'Text', children: ['engine default'] }))
    const tree = await draw($, undefined)
    expect(textOf(tree)).toBe('engine default')
  })
})
