# components/icons

Pre-composed TapTargetButton components, AI brand buttons, CSS-only SearchToolbar, and SearchGroup.

---

## Critical: No External Spacing — Ever

> **This is the single most important rule for this system.**

Every TapButton carries an invisible **44×44px tap target** wrapper with its own internal spacing. The visible "pill" is 32×32px. **Never add padding, margin, or gap around these buttons in consuming layouts.**

```tsx
// WRONG — adding gap pushes outer edges and makes the layout look broken
<div className="flex gap-4">
  <PlusTapButton />
  <SearchTapButton />
</div>

// CORRECT — zero gap; the tap targets handle all spacing
<div className="flex">
  <PlusTapButton />
  <SearchTapButton />
</div>
```

Adding `gap`, `p-*`, or `m-*` around tap buttons results in double-spacing: the invisible outer ring already reserves space, and your added space stacks on top of it, making everything look bloated and misaligned.

For groups (`TapTargetButtonGroup`, `SearchGroup`, `SearchToolbar`): the glass pill goes edge-to-edge. The group component already has correct internal geometry. Do not wrap groups in containers with padding.

---

## Architecture

### Core primitive — `TapTargetButton.tsx`

Location: `components/icons/TapTargetButton.tsx`

Exports:
- `TapTargetButton` — glass variant (default)
- `TapTargetButtonTransparent` — hover-only background
- `TapTargetButtonSolid` — solid filled background, accepts `bgColor`, `iconColor`, `hoverBgColor`
- `TapTargetButtonForGroup` — slimmer variant (36×36 outer, 24×24 icon) used inside groups
- `TapTargetButtonGroup` — glass pill container for grouped buttons

You should almost never import these primitives directly. Use the pre-composed buttons below instead.

### SVG rules

All custom icons use:
- `viewBox="0 0 24 24"`
- `strokeLinecap="round"`, `strokeLinejoin="round"`
- Open strokes only — no filled shapes, no `<rect>` that closes a path, no `Z` paths
- `stroke="currentColor"` (inherits from theme)

AI brand icons are filled SVGs — they use `fill` instead of `stroke` and inherit `currentColor` for monochrome mode or their brand hex when `colored={true}`.

---

## TapButtons — `tap-buttons.tsx`

General-purpose icon buttons. One import, one tag. SVG path, wrapper variant, and aria label are baked in.

```tsx
import { PlusTapButton, SearchTapButton } from "@/components/icons/tap-buttons";

<PlusTapButton />                          // glass (default)
<PlusTapButton variant="transparent" />    // hover-only bg
<PlusTapButton variant="group" />          // inside TapTargetButtonGroup
<PlusTapButton variant="solid" />          // solid bg
```

Pass-through props: `onClick`, `as`, `htmlFor`, `ariaLabel`, `disabled`, `className`, `strokeWidth`

**Available:**
`MenuTapButton` `PlusTapButton` `SearchTapButton` `SettingsTapButton` `MaximizeTapButton` `ArrowDownUpTapButton` `BellTapButton` `UploadTapButton` `UndoTapButton` `RedoTapButton` `CopyTapButton` `TrashTapButton` `ChevronLeftTapButton` `PanelLeftTapButton` `PanelRightTapButton` `SquarePenTapButton` `XTapButton` `FilterTapButton` `PlayTapButton` `PauseTapButton` `StopTapButton` `Volume2TapButton`

### Links

Pass `href` to render the tap button as a link instead of a `<button>`. The visual shell, tooltip, and `disabled` styling are identical — only the trigger element changes. Works on every pre-composed TapButton (general, AI, composite) and every variant (`glass`, `transparent`, `solid`, `group`).

```tsx
<PlusTapButton href="/tasks" />                     // next/link <Link> (internal, prefetched)
<XTapButton href="https://x.com" />                 // <a target="_blank" rel="noopener noreferrer">
<MailTapButton href="mailto:hi@example.com" />      // <a target="_blank">
<HelpTapButton href="/docs" target="_blank" />      // internal Link, opens in new tab
<HelpTapButton href="/docs" target="_blank" rel="noopener" /> // explicit rel override
<DownloadTapButton href="/api/file" prefetch={false} />        // disable Link prefetch
<DocsTapButton href="/docs" disabled />             // <span aria-disabled> — non-navigable, same look
```

Resolution rules:

| Condition | Trigger element |
|---|---|
| no `href` | `<button>` (or `<label>` when `as="label"`) — unchanged |
| `href` matches `http(s)://`, `mailto:`, or `tel:` | `<a target="_blank" rel="noopener noreferrer">` (defaults can be overridden) |
| `href` is internal | `next/link` `<Link>` — `target` / `rel` / `prefetch` pass through |
| `href` + `disabled` | `<span aria-disabled="true">` — same visual, no navigation |

The `target` prop overrides the auto-detect, including for internal Next.js links — so `<HelpTapButton href="/docs" target="_blank" />` opens an internal route in a new tab.

---

## AI Tap Buttons — `ai-tap-buttons.tsx`

AI provider brand logos and AI action icons. Same variant system as TapButtons, plus a `colored` prop for brand colors.

```tsx
import { OpenAITapButton, PowerTapButton } from "@/components/icons/ai-tap-buttons";

<OpenAITapButton />                         // monochrome (currentColor)
<OpenAITapButton colored />                 // brand color (#000 stays currentColor in dark mode)
<OpenAITapButton variant="group" colored /> // inside TapTargetButtonGroup
<PowerTapButton variant="solid" bgColor="bg-blue-600" />
```

Additional props: `colored` (boolean), `bgColor`, `iconColor`, `hoverBgColor`

**AI provider brands (filled SVGs):**
`OpenAITapButton` `AnthropicTapButton` `ClaudeTapButton` `GoogleTapButton` `GeminiTapButton` `MetaTapButton` `XTweetTapButton` `XaiTapButton` `MistralTapButton` `PerplexityTapButton` `LlamaTapButton` `DeepSeekTapButton` `FluxTapButton` `GrokTapButton` `HuggingFaceTapButton` `ElevenLabsTapButton` `ReplicateTapButton`

**AI action icons (stroke SVGs):**
`PowerTapButton` `TextGenerationTapButton` `ImageGenerationTapButton` `VideoGenerationTapButton` `AudioLinesTapButton` `TranscriptionTapButton` `TranslationTapButton` `CodeGenerationTapButton` `WandSparklesTapButton` `CpuTapButton`

### `colored` prop behavior

- `colored={false}` (default): all icons use `currentColor` — adapts to light/dark theme
- `colored={true}`: brand icons render in their official brand color; icons with black brands (`#000`, `#191919`) still use `currentColor` so they remain visible in dark mode

### Do not mix with other icon libraries

These buttons are **self-contained SVG components**. Do not pass Lucide icons or any external icon component as children. If you need a new icon, add it to `tap-buttons.tsx` or `ai-tap-buttons.tsx` using the `Wrap` helper and a raw SVG path. Adding new icons takes less than 10 lines.

---

## Adding new buttons

1. Add a named export to `tap-buttons.tsx` (or `ai-tap-buttons.tsx` for AI/brand) using the `Wrap` helper.
2. SVG paths: `viewBox="0 0 24 24"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, open strokes only.
3. Set a sensible `ariaLabel` default. Name: `{DescriptiveName}TapButton`.
4. No state, no hooks, no `'use client'`.

```tsx
export function MyNewTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="My Action" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </Wrap>
  );
}
```

---

## SearchToolbar — `SearchToolbar.tsx`

CSS-only expandable search input alongside TapButtons. A hidden checkbox drives expand/collapse state — zero JS for toggle.

```tsx
import { SearchToolbar } from "@/components/icons/SearchToolbar";

<SearchToolbar
  id="my-search"
  left={<><FilterTapButton /><ArrowDownUpTapButton /></>}
  right={<PlusTapButton />}
  mode="responsive"
  spread={true}
  placeholder="Search..."
/>
```

| Prop | Default | Description |
|---|---|---|
| `id` | auto | Unique ID for the checkbox toggle |
| `left` | — | Buttons to the left of search |
| `right` | — | Buttons to the right of search |
| `mode` | `"responsive"` | `"inline"` (stays in place), `"full-width"` (takes over), `"responsive"` (inline on desktop, full-width on mobile) |
| `spread` | `true` | Distribute buttons evenly on mobile (<640px) |
| `placeholder` | `"Search..."` | Input placeholder text |
| `inputName` | `"search"` | Input name attribute |

### Presets — `search-toolbar-presets.tsx`

```tsx
import { MobileFilterBar, DesktopToolbar, MinimalSearchBar } from "@/components/icons/search-toolbar-presets";

<MobileFilterBar />     // ( < ) ( Filter ) ( Sort ) ( 🔍→input ) ( + )
<DesktopToolbar />      // ( ≡ ) ( Filter ) ( ⚙ ) ( ⤢ ) ( 🔍→input ) ( + )
<MinimalSearchBar />    // ( 🔍→input ) ( + )
```

---

## SearchGroup — `SearchToolbar.tsx`

Glass pill group with built-in expandable search. Icons live inside a shared glass border. When search is tapped, behavior depends on the `expand` prop.

```tsx
import { SearchGroup, SearchGroupTrigger } from "@/components/icons/SearchToolbar";

<SearchGroup id="my-group" placeholder="Search...">
  <FilterTapButton variant="group" />
  <ArrowDownUpTapButton variant="group" />
  <SearchGroupTrigger id="my-group" />
  <SettingsTapButton variant="group" />
</SearchGroup>
```

### `expand` prop (default `true`)

**`expand={true}`** — Pill grows to fill available space. Icons stay visible. The search trigger icon collapses and an input field appears in-flow next to the remaining icons. Best when the group has room to grow (e.g., centered between side buttons).

**`expand={false}`** — Pill stays fixed size. All icons fade out and the input overlays in the same space. Zero layout shift. Best for tight layouts or standalone groups.

### `fill` prop (default `false`)

When `true`, the group stretches to full width on mobile (<640px) with icons evenly distributed. Useful when the group is the primary element in a mobile row.

### Layout pattern: centered group with side buttons

```tsx
<div className="flex items-center w-full">
  <ChevronLeftTapButton />
  <SearchGroup id="x" expand placeholder="Search...">
    <FilterTapButton variant="group" />
    <SearchGroupTrigger id="x" />
    <SettingsTapButton variant="group" />
  </SearchGroup>
  <PlusTapButton />
</div>
```

The group gets `flex: 1` when expanded, filling the space between the pinned side buttons.

### Group presets

```tsx
import { FilterSearchGroup, ToolsSearchGroup } from "@/components/icons/search-toolbar-presets";

<FilterSearchGroup />   // [ Filter | Sort | Search | Settings ]
<ToolsSearchGroup />    // [ Filter | Sort | Search | Maximize | Settings ]
```

---

## Live demos

- **General buttons + SearchToolbar/Group:** `app/(dev)/demos/` — `AllButtonsShowcase` component
- **AI provider + action buttons:** `app/(dev)/demos/button-demo/page.tsx`

---

## Files

| File | Purpose |
|---|---|
| `tap-buttons.tsx` | General-purpose pre-composed icon buttons |
| `ai-tap-buttons.tsx` | AI provider brand logos + AI action icon buttons |
| `SearchToolbar.tsx` | SearchToolbar + SearchGroup + SearchGroupTrigger |
| `search-toolbar.css` | Scoped CSS (`.stb-` prefix) for search expand/collapse |
| `search-toolbar-presets.tsx` | Ready-to-use toolbar and group presets |

| Supporting file | Purpose |
|---|---|
| `components/icons/TapTargetButton.tsx` | Core primitive — all variants and group container |
| `removed (ssr) route group — _components/button-demo/AllButtonsShowcase.tsx` | Full showcase of all general buttons and toolbars |
| `removed (ssr) route group — _components/button-demo/AddFilterSearchRow.tsx` | Usage example: filter + search row |
| `removed (ssr) route group — _components/button-demo/ButtonRow.tsx` | Usage example: mixed standalone + grouped row |
