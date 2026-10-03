import type { Register } from 'claude-code'

type Style = { color?: string; bold?: boolean; italic?: boolean; dimColor?: boolean; strikethrough?: boolean }

// Style colors name a key of `colors`, or are a raw color.
export const CONFIG = {
  colors: {
    purple: '#9d7cd8',
    orange: '#f5a742',
    amber: '#e5c07b',
    green: '#7fd88f',
  } as Record<string, string>,
  styles: {
    heading: { bold: true, color: 'purple' },
    bold: { bold: true, color: 'orange' },
    italic: { italic: true, color: 'amber' },
    code: { color: 'green' },
    strike: { strikethrough: true },
    listMarker: { color: 'orange' },
    quoteBar: { dimColor: true },
    quote: { italic: true },
  } as Record<string, Style>,
  glyphs: { bullet: '-', quoteBar: '│', reply: '●' },
  indent: 2,
  debugTiming: false,
}

type Mark = 'bold' | 'italic' | 'code' | 'strike'
type Run = { text: string; marks: Mark[] }
type Item = { marker: string; text: string; children: Item[] }
type Block =
  | { kind: 'heading' | 'para' | 'plain'; text: string }
  | { kind: 'native'; raw: string }
  | { kind: 'list'; items: Item[] }
  | { kind: 'quote'; lines: string[] }

const LINK = /^!?\[[^\]\n]*\]\([^)\n]*\)/
const FENCE = /^\s*(`{3,})\s*([^\s`]*)/
const HEADING = /^#{1,6}\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE = /^\s*\|/

// An unclosed marker turns the rest of the text into plain text.
function parseInline(s: string, marks: Mark[] = []): Run[] {
  const out: Run[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ text: buf, marks })
    buf = ''
  }

  let i = 0
  while (i < s.length) {
    const ch = s[i]

    if (ch === '\\' && i + 1 < s.length && '\\`*'.includes(s[i + 1])) {
      buf += s[i + 1]
      i += 2
    } else if (ch === '`') {
      const end = s.indexOf('`', i + 1)
      if (end < 0) {
        buf += s.slice(i)
        break
      }
      if (end === i + 1) {
        buf += '``'
      } else {
        flush()
        out.push({ text: s.slice(i + 1, end), marks: [...marks, 'code'] })
      }
      i = end + 1
    } else if (s.startsWith('***', i) || s.startsWith('~~', i)) {
      const strike = s.startsWith('~~', i)
      const open = strike ? '~~' : '***'
      const end = s.indexOf(open, i + open.length)
      if (end < 0) {
        buf += s.slice(i)
        break
      }
      if (end === i + open.length) {
        buf += open + open
      } else {
        flush()
        const inner = strike ? ['strike' as const] : ['bold' as const, 'italic' as const]
        out.push(...parseInline(s.slice(i + open.length, end), [...marks, ...inner]))
      }
      i = end + open.length
    } else if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2)
      if (end < 0) {
        buf += s.slice(i)
        break
      }
      if (end === i + 2) {
        buf += '****'
      } else {
        flush()
        out.push(...parseInline(s.slice(i + 2, end), [...marks, 'bold']))
      }
      i = end + 2
    } else if (ch === '*' && i + 1 < s.length && !/\s/.test(s[i + 1])) {
      let end = i + 1
      while (end < s.length && !(s[end] === '*' && s[end + 1] !== '*')) {
        end += s.startsWith('**', end) || s[end] === '\\' ? 2 : 1
      }
      if (end >= s.length) {
        buf += s.slice(i)
        break
      }
      flush()
      out.push(...parseInline(s.slice(i + 1, end), [...marks, 'italic']))
      i = end + 1
    } else if (ch === '[' || ch === '!') {
      const link = LINK.exec(s.slice(i))
      buf += link ? link[0] : ch
      i += link ? link[0].length : 1
    } else {
      buf += ch
      i += 1
    }
  }

  flush()
  return out
}

const NATIVE_LIMIT = 10000

// A header row plus a delimiter row of the same width; mid-stream it stays plain text until then.
function isCompleteTable(lines: string[]): boolean {
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  if (lines.length < 2) return false
  const delim = cells(lines[1])
  return delim.length === cells(lines[0]).length && delim.every(c => /^:?-+:?$/.test(c))
}

function nest(flat: { indent: number; item: Item }[]): Item[] {
  const root: Item[] = []
  const stack = [{ indent: -1, children: root }]
  for (const { indent, item } of flat) {
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    stack[stack.length - 1].children.push(item)
    stack.push({ indent, children: item.children })
  }
  return root
}

const startsBlock = (l: string) =>
  FENCE.test(l) || HEADING.test(l) || QUOTE.test(l) || ITEM.test(l) || TABLE.test(l)

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      let j = i + 1
      const isClose = (l: string) => /^`+$/.test(l.trim()) && l.trim().length >= fence[1].length
      while (j < lines.length && !isClose(lines[j])) j++
      if (j < lines.length) {
        blocks.push({ kind: 'native', raw: lines.slice(i, j + 1).join('\n') })
        i = j + 1
      } else {
        blocks.push({ kind: 'plain', text: lines.slice(i).join('\n') })
        i = lines.length
      }
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = []
      for (let m; i < lines.length && (m = QUOTE.exec(lines[i])); i++) quoted.push(m[1])
      blocks.push({ kind: 'quote', lines: quoted })
      continue
    }

    if (ITEM.test(line)) {
      const flat: { indent: number; item: Item }[] = []
      while (i < lines.length) {
        const m = ITEM.exec(lines[i])
        if (m) {
          const marker = /^\d/.test(m[2]) ? m[2] : CONFIG.glyphs.bullet
          flat.push({ indent: m[1].length, item: { marker, text: m[3], children: [] } })
          i++
        } else if (!lines[i].trim()) {
          let k = i
          while (k < lines.length && !lines[k].trim()) k++
          if (k >= lines.length || !ITEM.test(lines[k])) break
          i = k
        } else if (/^\s/.test(lines[i]) && !FENCE.test(lines[i])) {
          flat[flat.length - 1].item.text += '\n' + lines[i].trim()
          i++
        } else {
          break
        }
      }
      blocks.push({ kind: 'list', items: nest(flat) })
      continue
    }

    const isTable = TABLE.test(line)
    const text: string[] = []
    while (i < lines.length && lines[i].trim() && (text.length === 0 || (isTable ? TABLE.test(lines[i]) : !startsBlock(lines[i])))) {
      text.push(lines[i++])
    }
    const raw = text.join('\n')
    blocks.push(isTable ? (isCompleteTable(text) ? { kind: 'native', raw } : { kind: 'plain', text: raw }) : { kind: 'para', text: raw })
  }

  return blocks
}

const paint = (style: Style): Style =>
  style.color ? { ...style, color: CONFIG.colors[style.color] ?? style.color } : style

export const register: Register = on => {
  const lastText = new Map<string, string>()

  // Display-only: the committed message still reaches the ui.render hook below.
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    try {
      const text: unknown = e.props.text
      if (typeof text !== 'string') return next(e)
      const t0 = performance.now()
      const blocks = parseBlocks(text)
      const t1 = performance.now()
      if (blocks.length === 0) return next(e)

      const { Box, Text, Markdown } = $.ui.resolve(e)
      const { styles, glyphs, indent } = CONFIG

      const inline = (src: string, base: Style = {}) => (
        <Text {...paint(base)}>
          {parseInline(src).map(run => {
            const style: Style = {}
            for (const mark of run.marks) Object.assign(style, styles[mark])
            return Object.keys(style).length ? <Text {...paint(style)}>{run.text}</Text> : run.text
          })}
        </Text>
      )

      const item = (it: Item) => (
        <Box flexDirection="row">
          <Box flexShrink={0}>
            <Text {...paint(styles.listMarker)}>{`${it.marker} `}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {inline(it.text)}
            {it.children.length > 0 ? (
              <Box flexDirection="column" paddingLeft={indent}>
                {it.children.map(child => item(child))}
              </Box>
            ) : null}
          </Box>
        </Box>
      )

      const block = (b: Block) => {
        switch (b.kind) {
          case 'heading':
            return inline(b.text, styles.heading)
          case 'para':
            return inline(b.text)
          case 'plain':
            return <Text>{b.text}</Text>
          case 'list':
            return <Box flexDirection="column">{b.items.map(it => item(it))}</Box>
          case 'quote':
            return (
              <Box flexDirection="column">
                {b.lines.map(line => (
                  <Box flexDirection="row">
                    <Box flexShrink={0}>
                      <Text {...paint(styles.quoteBar)}>{`${glyphs.quoteBar} `}</Text>
                    </Box>
                    <Box flexGrow={1} flexShrink={1}>
                      {inline(line || ' ', styles.quote)}
                    </Box>
                  </Box>
                ))}
              </Box>
            )
          case 'native':
            return b.raw.length > NATIVE_LIMIT ? <Text>{b.raw}</Text> : <Markdown text={b.raw} />
        }
      }

      const tree = (
        <Box flexDirection="row">
          <Box flexShrink={0}>
            <Text>{e.props.isFirstOfReply ? `${glyphs.reply} ` : '  '}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1}>
            {blocks.map(b => block(b))}
          </Box>
        </Box>
      )

      if (CONFIG.debugTiming) {
        const t2 = performance.now()
        const repeat = lastText.get(e.requestId) === text
        lastText.set(e.requestId, text)
        $.ui.log(
          `md-render ${e.requestId} chars=${text.length} blocks=${blocks.length} parse=${(t1 - t0).toFixed(2)}ms build=${(t2 - t1).toFixed(2)}ms sameText=${repeat}`,
          { to: 'debug' },
        )
      }
      return tree
    } catch {
      return next(e)
    }
  })
}
