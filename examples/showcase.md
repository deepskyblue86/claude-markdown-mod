# md-render showcase

## Text styles

- **Bold** for key terms
- *Italic* for nuance
- ***Bold italic*** for both
- ~~Strikethrough~~ for dropped ideas
- `inline code` for commands, paths and identifiers, e.g. `src/index.ts`

## Lists

1. Locate with `grep`
2. Read only what's needed
3. Edit with a minimal diff

- Parent
  - Child one
  - Child two
    - Grandchild

> A signal is not evidence.

## Table

| Tool | Purpose | Example |
|:-----|:-------:|--------:|
| grep | Search text | `grep -rn "TODO" src/` |
| find | Locate files | `find . -name "*.ts"` |
| git | Version control | `git status` |

## Code

```ts
function greet(name: string): string {
  return `Hello, ${name}`
}
```

A [link](https://example.com) shows its address beside the text.
