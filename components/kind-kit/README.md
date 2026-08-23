# kind-kit — proven primitives for kind components

Reusable, typed building blocks for **kind components** (Shape renderers): the
compiled ones in this repo and the DB-authored ones (`content_ir.kind_component`,
`source='db'`) that an agent writes and the in-page allowlist compiler runs.
Import them instead of hand-rolling drag-and-drop, grids, panels, chips,
copy bars or skeletons — consistent results by construction.

Every primitive is pure presentation over `react`, `lucide-react`, shadcn
`@/components/ui/*`, `cn` from `@/lib/utils` and (for the header bar)
`@/components/agent-copy/CopyButtons`. Nothing here reaches app data; every
import path below is on the compiler allowlist
(`features/agent-apps/utils/allowed-imports.ts`).

A DB kind component receives `{ data, kind, config }` (`data` = the kind
instance value, possibly PARTIAL while streaming). The kit assumes that:
every prop that takes data tolerates `undefined`, nothing truncates text, and
layout never produces more columns than the content can afford.

Live demo exercising everything: `/demos/kind-kit`
(`app/(dev)/demos/kind-kit/page.dev.tsx`).

---

## Import paths (exact)

```ts
import { SortableList } from "@/components/kind-kit/SortableList";
import { KindPanelGrid } from "@/components/kind-kit/KindPanelGrid";
import { KindPanel } from "@/components/kind-kit/KindPanel";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import { StreamingSkeleton, useStreamingValue, streamList, streamText } from "@/components/kind-kit/StreamingSkeleton";
import { KeywordChip, TagList } from "@/components/kind-kit/TagList";
```

No barrel — import each file by its path exactly as written.

---

## The standard kind-component skeleton

```tsx
import { useState } from "react";
import { SearchCheck, Tags } from "lucide-react";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import { KindPanelGrid } from "@/components/kind-kit/KindPanelGrid";
import { KindPanel } from "@/components/kind-kit/KindPanel";
import { TagList } from "@/components/kind-kit/TagList";
import { StreamingSkeleton, streamList, streamText } from "@/components/kind-kit/StreamingSkeleton";

export default function Component({ data, kind, config }) {
  const lists = streamList(data?.lists);                 // [] until it arrives
  const title = streamText(data?.primary_keyword, "Keyword research");
  if (lists.length === 0) return <StreamingSkeleton layout="cards" rows={2} />;

  return (
    <div className="space-y-3">
      <KindHeaderBar
        icon={SearchCheck}
        title={title}
        stats={[{ label: "buckets", value: lists.length }]}
        streaming={data?.is_complete !== true}
        copy={{
          label: "Keyword research",
          human: () => lists.map((l) => `${l.label}: ${(l.keywords ?? []).join(", ")}`).join("\n"),
          json: () => data,
        }}
      />
      <KindPanelGrid minColumnWidth={280}>
        {lists.map((list, i) => (
          <KindPanel
            key={list.label ?? i}
            icon={Tags}
            title={streamText(list.label, "Keywords")}
            count={(list.keywords ?? []).length}
            streaming={list.complete === false}
            subline={list.rationale}
          >
            <TagList items={streamList(list.keywords)} />
          </KindPanel>
        ))}
      </KindPanelGrid>
    </div>
  );
}
```

---

## `SortableList<T>` — `@/components/kind-kit/SortableList`

Drag-to-reorder list. While dragging, the rows the item passes **displace**
(translate) out of the way and a **shadowed dashed placeholder** marks exactly
where the item will land. Drag starts from the grip handle only (text and
inputs inside rows stay usable). Up/down arrow buttons are the keyboard and
touch fallback. Native HTML5 DnD — no dependencies, no providers.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `items` | `readonly T[]` | required | Current order. Never mutated; the new order arrives via `onReorder`. |
| `onReorder` | `(items: T[]) => void` | required | Called with the **full reordered array** after a drop or an arrow press. |
| `getKey` | `(item: T, index: number) => string` | string → itself; object → `id`/`key`; else index | Stable key per item. Pass it whenever items are objects without `id`. |
| `renderItem` | `(item: T, ctx: { index: number; isDragging: boolean }) => ReactNode` | string/number → itself; object → `label`/`title`/`name`/`text`; else JSON | Row content. |
| `onRemove` | `(item: T, index: number) => void` | — | When set, every row gets an inline remove (X) control. |
| `disabled` | `boolean` | `false` | Disables drag, arrows and remove; rows still render. |
| `hideArrows` | `boolean` | `false` | Drag only — hides the up/down buttons. |
| `emptyState` | `ReactNode` | — | Rendered instead of the list when `items` is empty (nothing renders otherwise). |
| `className` / `itemClassName` | `string` | — | Wrapper `<ul>` / every `<li>`. |
| `ariaLabel` | `string` | — | Accessible name of the list. |

```tsx
const [steps, setSteps] = useState(data?.steps ?? []);
<SortableList
  items={steps}
  getKey={(s) => s.id}
  onReorder={setSteps}
  onRemove={(s) => setSteps((prev) => prev.filter((x) => x.id !== s.id))}
  renderItem={(s) => (
    <div className="min-w-0">
      <div className="font-medium">{s.title}</div>
      <div className="text-xs text-muted-foreground">{s.detail}</div>
    </div>
  )}
/>
```

---

## `KindPanelGrid` — `@/components/kind-kit/KindPanelGrid`

Content-aware responsive grid for side-by-side panels. Columns are whatever
fits at **≥ `minColumnWidth`** each (CSS `auto-fit`), so the grid never
produces more columns than the content can afford, and every panel in a row
stretches to the same height (footers line up when children are `KindPanel`s).

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `children` | `ReactNode` | required | The panels (usually `KindPanel`s). |
| `minColumnWidth` | `number` (px) | `280` | Minimum track width before a column is dropped. Use `320`–`360` for text-heavy panels. |
| `maxColumns` | `number` | — | Hard ceiling on columns however wide the container is. |
| `gap` | `"sm" \| "md" \| "lg"` | `"md"` | 8 / 12 / 16 px. |
| `fill` | `"auto-fit" \| "auto-fill"` | `"auto-fit"` | `auto-fit`: a short last row lets panels grow to fill. `auto-fill`: tracks keep their width. |
| `className` | `string` | — | — |

```tsx
<KindPanelGrid minColumnWidth={300} maxColumns={3}>
  {options.map((o) => <KindPanel key={o.id} title={o.name}>…</KindPanel>)}
</KindPanelGrid>
```

---

## `KindPanel` — `@/components/kind-kit/KindPanel`

The standard panel for a sub-section (a keyword bucket, an option card, a
results group). Fixed layout: compact header (icon · title that **wraps** ·
count · badge · spinner · ≤2 inline `actions` · an overflow **⋯ menu** that
absorbs every other control) → full-width `subline` on its **own line** →
body → `footer` **pinned to the bottom** (`mt-auto`), so "Add" rows align
across sibling panels inside a `KindPanelGrid`.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `title` | `ReactNode` | required | Header title. Wraps, never truncates. |
| `icon` | `ComponentType<{ className?: string }>` | — | Lucide icon before the title. |
| `count` | `number \| string` | — | Count pill after the title. |
| `badge` | `ReactNode` | — | Extra pill after the count (status, score). |
| `streaming` | `boolean` | `false` | Spinner in the header while this panel's data is still arriving. |
| `actions` | `ReactNode` | — | **At most one or two** compact inline controls. Everything else goes in `menuItems`. |
| `menuItems` | `{ label: string; onSelect: () => void; icon?; disabled?; destructive?; separatorBefore? }[]` | — | Items of the overflow (⋯) menu. |
| `subline` | `ReactNode` | — | Full-width line under the header (a rationale, a hint). Never placed beside the title. |
| `children` | `ReactNode` | — | Body. |
| `footer` | `ReactNode` | — | Pinned to the bottom, above a top border (an "Add" row, a summary, a copy bar). |
| `variant` | `"card" \| "bare"` | `"card"` | `card` = bordered card. `bare` = no border/background when the host is the chrome. |
| `dense` | `boolean` | `false` | Tighter paddings. |
| `className` / `bodyClassName` | `string` | — | Section / body wrapper. |

```tsx
<KindPanel
  icon={Tags}
  title="Long-tail keywords"
  count={keywords.length}
  subline="Lower volume, higher intent — good for supporting pages."
  menuItems={[
    { label: "Copy list", icon: Copy, onSelect: copyList },
    { label: "Clear", icon: Trash2, destructive: true, separatorBefore: true, onSelect: clear },
  ]}
  footer={<TagList items={[]} onAdd={addKeyword} addPlaceholder="Add keyword…" />}
>
  <TagList items={keywords} onRemove={remove} />
</KindPanel>
```

---

## `KindHeaderBar` — `@/components/kind-kit/KindHeaderBar`

The standard compact header of a kind component: icon · title (the instance's
`title_key` value) · at-a-glance stats · streaming indicator · the copy bar.
One row that wraps on narrow widths; the copy bar stays on the right.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `title` | `ReactNode` | required | Usually `data[title_key]`. |
| `icon` | `ComponentType<{ className?: string }>` | — | Lucide icon. |
| `subtitle` | `ReactNode` | — | Muted line under the title. |
| `stats` | `{ label: string; value: ReactNode; icon?; title?: string }[]` | — | Compact "value label" stats (e.g. `{ label: "keywords", value: 42 }`). |
| `streaming` | `boolean` | `false` | Spinner + `streamingLabel` while the instance is still arriving. |
| `streamingLabel` | `string` | `"Streaming"` | — |
| `copy` | `CopyButtonsProps` minus `size`/`className` | — | The copy bar. **Required inside: `label: string`.** Pass what you have: `human?: string \| () => string`, `agent?: AgentPayloadInput \| string \| () => …`, `json?: unknown \| () => unknown`, `export?: { items, sheetRows? }`, `hide?: ("copy" \| "ai" \| "export")[]`. Omit `copy` to render no copy bar. |
| `actions` | `ReactNode` | — | Extra controls between the stats and the copy bar. |
| `size` | `"sm" \| "md"` | `"sm"` | `sm` for in-chat blocks; `md` for page-level kind surfaces. |
| `className` | `string` | — | — |

```tsx
<KindHeaderBar
  icon={SearchCheck}
  title={data?.title ?? "Research"}
  subtitle={data?.primary_keyword}
  stats={[{ label: "buckets", value: lists.length }, { label: "keywords", value: total }]}
  streaming={!data?.is_complete}
  copy={{ label: "Keyword research", human: () => toMarkdown(data), json: () => data }}
/>
```

---

## `StreamingSkeleton` + helpers — `@/components/kind-kit/StreamingSkeleton`

### `StreamingSkeleton`
Skeleton that mimics the layout the real content will have, for the moment
before anything lands. Never use it while data exists — render the partial
data instead (the pipeline streams).

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `layout` | `"list" \| "cards" \| "table" \| "text"` | `"list"` | Shape to mimic. |
| `rows` | `number` | `3` | Rows (list/table/text lines) or cards. |
| `columns` | `number` | table `3`, cards `2` | Columns for table/cards. |
| `header` | `boolean` | `true` | Draw a title-bar line above the body. |
| `label` | `string` | `"Loading"` | Accessible label. |
| `className` | `string` | — | — |

### `useStreamingValue(value, fallback)` → `{ value, arrived }`
Sticky, tolerant read: returns the latest **defined** value seen (a re-parse
that momentarily drops a field does not blank the UI), `fallback` until one
arrives, and `arrived: true` once any real value has been observed.
A hook — call it unconditionally at the top of the component, and pass a
**field read** (`data?.summary`), never an expression that builds a fresh
object/array each render (`data?.items ?? []` — use `streamList` for that).

### `streamList<T>(value): T[]` · `streamText(value, fallback = ""): string`
`streamList` returns `value` when it is an array, else `[]`. `streamText`
returns `value` when it is a non-empty string, else `fallback`. Use them on
every `data.xxx` read instead of trusting the field exists.

```tsx
const { value: summary, arrived } = useStreamingValue(data?.summary, "");
const items = streamList(data?.items);
if (!arrived && items.length === 0) return <StreamingSkeleton layout="list" rows={4} />;
```

---

## `KeywordChip` / `TagList` — `@/components/kind-kit/TagList`

Chips that **wrap, never truncate** — the full phrase is always visible (the
text wraps inside the chip; the list wraps chips onto new rows). Optional
select toggle, remove (X), inline edit (pencil or double-click → input; Enter
commits, Esc cancels), and an inline "Add" input.

### `KeywordChip`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | required | The phrase, shown in full. |
| `meta` | `ReactNode` | — | Small trailing detail (count, volume, score). |
| `icon` | `ComponentType<{ className?: string }>` | — | Leading icon. |
| `selected` | `boolean` | `false` | Selected state (pass `onSelect` to make it a toggle). |
| `onSelect` | `(selected: boolean) => void` | — | Makes the chip a toggle; called with the next state. |
| `onRemove` | `() => void` | — | Adds an X control. |
| `onEdit` | `(next: string) => void` | — | Enables inline edit; called with the committed text. |
| `disabled` | `boolean` | `false` | Greys the chip; disables select/remove/edit. |
| `tone` | `"default" \| "primary" \| "muted"` | `"default"` | — |
| `size` | `"sm" \| "md"` | `"sm"` | — |
| `className` | `string` | — | — |

### `TagList`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `items` | `readonly (string \| { label: string; key?: string; meta?: ReactNode; disabled?: boolean })[]` | required | Phrases. Key defaults to `label`. |
| `selected` | `readonly string[]` | — | Selected keys; pass with `onToggle`. |
| `onToggle` | `(key: string, selected: boolean) => void` | — | Makes chips toggles. |
| `onRemove` | `(key: string, index: number) => void` | — | X on every chip. |
| `onEdit` | `(key: string, index: number, next: string) => void` | — | Inline edit on every chip. |
| `onAdd` | `(label: string) => void` | — | Renders an inline "Add" control at the end; called with the trimmed text. |
| `addPlaceholder` | `string` | `"Add…"` | Placeholder / button text of the add control. |
| `emptyState` | `ReactNode` | — | Shown when `items` is empty. |
| `tone` / `size` / `disabled` / `className` | as `KeywordChip` | — | Applied to every chip. |

```tsx
<TagList
  items={keywords.map((k) => ({ label: k.phrase, meta: k.volume }))}
  selected={selected}
  onToggle={(key, next) => setSelected((s) => (next ? [...s, key] : s.filter((x) => x !== key)))}
  onRemove={(key) => removeKeyword(key)}
  onEdit={(key, _i, next) => renameKeyword(key, next)}
  onAdd={(label) => addKeyword(label)}
  addPlaceholder="Add keyword…"
/>
```

---

## Rules the kit encodes (so you do not re-learn them)

- **Never truncate a phrase.** Chips and titles wrap. If something must be
  short, shorten the data, not the rendering.
- **Never more columns than the content can afford.** `KindPanelGrid` with a
  real `minColumnWidth`; no hand-written `grid-cols-4`.
- **Headers are compact.** Title + count + ≤2 inline controls; everything else
  in the `KindPanel` overflow menu.
- **A rationale is a subline**, full width, under the header — never beside the
  title.
- **"Add" rows live in `footer`** so they align across sibling panels.
- **Streaming is normal.** Read fields with `streamList` / `streamText` /
  `useStreamingValue`; a skeleton only before anything exists.
- **Copy is mandatory** on every kind component — `KindHeaderBar`'s `copy` is
  the place; it renders the platform `CopyButtons`.

## Change log

- 2026-08-23 — Created: SortableList, KindPanelGrid, KindPanel, KindHeaderBar,
  StreamingSkeleton (+ useStreamingValue / streamList / streamText),
  KeywordChip / TagList. Allowlisted in `features/agent-apps/utils/allowed-imports.ts`.
  Demo: `/demos/kind-kit`.
