# Item system — `components/official/item/`

The reusable **list row + menu** primitives. Built to emulate Claude.ai's sidebar
(full-width labels that fade at the edge, hover-revealed kebab, non-blocking
menus), Claude Code desktop (submenus + single-key shortcuts), Linear, and Notion.

Three primitives, one schema:

| Export | From | Role |
|---|---|---|
| `ItemRow` | `./ItemRow` | The list/sidebar/tree row. |
| `ItemMenu`, `ItemContextMenu` | `./ItemMenu` | Schema-driven menu (dropdown / right-click / mobile drawer). |
| `EditableLabel` | `./EditableLabel` | Inline rename-in-place text. |
| types + guards | `./types` | `ItemMenuConfig`, `ItemMenuEntry`, `ItemRowProps`, … |

No barrel — import from the concrete file.

---

## ItemRow

```tsx
<ItemRow
  label={conv.title}
  active={conv.id === activeId}
  onOpen={() => open(conv)}                       // or href="/chat/123" for <Link>
  menu={() => buildMenu(conv)}                    // lazy: built on open
  rename={{ value: conv.title, onCommit: (next) => rename(conv.id, next) }}
  trailing={conv.favorite ? <Star … /> : null}    // glides left on hover
/>
```

- **The fade, not ellipsis.** The label runs full width and fades at the right
  edge (`.item-fade`). On hover/focus/menu-open the fade *deepens* (the
  `--item-fade-w` custom property animates) to clear the kebab; on touch it's
  permanently deep (kebab always visible). The full text stays in the
  accessibility tree and in the `title` attribute — the mask is visual only.
- **Kebab reserves no space** — it's an absolute sibling, revealed on
  hover/focus/`data-[state=open]`/touch.
- **Right-click = the same menu** (`ItemContextMenu`), disabled on touch.
- **Inline rename**: double-click the row, or add a `command` with
  `intent: "rename"` to the menu — ItemRow swaps that entry's action for its own
  edit state and wins the focus race via `onCloseAutoFocus`.
- Sizes `sm | md | lg` (h-7 / h-8 / h-10); `indent` for trees.

## ItemMenu / ItemContextMenu

One `ItemMenuConfig` → three presentations. **No dimming backdrop, ever**
(`modal={false}` on both desktop Radix roots). Desktop dropdown and right-click
context menu share one renderer, so they can't drift; mobile is a Vaul bottom
drawer with submenu drill-in.

```tsx
<ItemMenu config={config} align="end">
  <IconButton aria-label="Options"><MoreHorizontal /></IconButton>
</ItemMenu>

<ItemContextMenu config={config}>{surface}</ItemContextMenu>
```

`config` accepts a value or a `() => ItemMenuConfig` thunk (resolved on open —
use the thunk for per-row builders so you don't build N menus per render).

### Schema (`./types`)

`ItemMenuConfig = { header?, sections: ItemMenuSection[] }`. Each section is
`{ id?, label?, items }`; separators are derived from section boundaries — never
declared. Entries are a discriminated union on `kind`:

- **`command`** (default): `onSelect`, `tone`, `icon`, `iconClassName`,
  `description`, `disabled` + `disabledReason`, `shortcut`/`shortcutKey`,
  `toast`, `intent`.
- **`checkbox`**: persistent toggle, stays open. **View options only.**
- **`link`**: real `<a>` (middle-click / cmd-click).
- **`submenu`**: nested `sections`.

### Conventions / rules

- **State-flips stay commands.** Pin/Unpin, Archive/Unarchive,
  Include/Exclude — swap the entry's `label`+`icon` from the current state in
  your builder. `checkbox` is reserved for genuine view options ("Show
  timestamps") where seeing state at a glance matters and the menu stays open.
- **Async feedback.** `onSelect` runs synchronously (preserves the user-gesture
  needed by clipboard) and the menu closes. If it returns a Promise **and**
  `toast` is set → `toast.promise`. A Promise **without** `toast` is
  fire-and-forget — the right choice for optimistic thunks that already
  toast/revert themselves (wrapping would double-toast). Reach for `toast` only
  on genuinely slow ops with no optimistic UI (Duplicate, Export).
- **`shortcutKey`.** A menu that adopts single-key activation should assign keys
  to *most* items (Claude Code: P/R/A/D), not one. Declared keys win over Radix
  typeahead; undeclared letters still typeahead.
- **Tokens only** — `bg-popover`, `text-foreground`, `text-destructive`,
  `bg-accent`, `border-border`. Lucide icons, no emojis.

## EditableLabel

```tsx
<EditableLabel value={title} onCommit={save} />                       // click
<EditableLabel value={title} activation="doubleClick" onCommit={save} />
<EditableLabel value={title} commitMode="await" onCommit={saveAsync} /> // spinner
```

Enter/blur commits, Esc cancels, whitespace-only → `emptyFallback` (or cancels).
`validate` blocks the commit with an inline error. Input is 16px on mobile
(prevents iOS focus-zoom). ItemRow uses it internally in `controlled` mode.

---

## Migrating from `AdvancedMenu` (deleted)

| AdvancedMenu | Item system |
|---|---|
| `MenuItem[]` with `category` strings | `ItemMenuConfig.sections[]` with `label` |
| `key` | `id` |
| `iconColor` | `iconClassName` (icon only) / `tone: "destructive"` |
| `action` | `onSelect` |
| in-menu loading/success + `successMessage` | `toast: { loading, success, error }` |
| `showBackdrop` / `backdropBlur` | gone — menus are never modal |
| singleton hook + synthetic anchor | per-row `ItemMenu` / `ItemContextMenu` triggers |
| rename via `TextInputDialog` | `intent: "rename"` → ItemRow inline rename |

---

## Fade constants

Kebab = 24px (`md`) at `right-1`; one trailing indicator shifts left `1.625rem`;
transparent zone `--item-fade-w` = `2.75rem` + a `1.25rem` ramp. Tuned so the
label clears everything that appears on hover. Defined in `app/globals.css`
(`@property --item-fade-w` + the `.item-row` / `.item-fade` / `.item-shift`
utilities). Tailwind 4's native `mask-*` utilities can't transition gradient
stops, which is why the fade lives in a registered custom property.
