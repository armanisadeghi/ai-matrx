---
name: create-tool-renderer
description: Create custom MCP tool result displays for the chat interface. Builds both inline (chat-stream preview) and overlay (full-screen modal) components that consume the canonical ToolLifecycleEntry, with proper registry integration. Use when the user wants to add a new hardcoded tool visualization, create a tool renderer, display tool results in chat, or mentions creating components for MCP tool output.
---

# Create Tool Renderer (Hardcoded)

Build a custom, hand-authored visualization for an MCP tool in the AI Matrx chat interface. Given a tool name and example data, produce production-ready inline + optional overlay components and register them.

This skill covers **hardcoded** (in-repo) renderers only. DB-stored dynamic renderers live in `features/tool-call-visualization/dynamic/` (table: `public.tool_ui`) and are authored through the admin UI at `/administration/mcp-tools/[toolId]/ui` using the generator prompt at `features/tool-call-visualization/admin/tool-ui-generator-prompt.ts` — not through this skill.

**Architecture snapshot:** `features/tool-call-visualization/EXPANSION.md` — data paths, default vs custom resolution, DB shapes.

## Cardinal Rule: HIDE ABSOLUTELY NOTHING

Every piece of data in the tool result MUST surface somewhere in the UI.

- Inline: key information at a glance so users rarely need to open the overlay. Truncation here is OK if there is a "View all" button to the overlay.
- Overlay: every field, every nested object, every source, every metadata value. Long text collapses with "Show more" — it is never omitted.
- If a field exists in the data, it gets rendered. Period.

## Prerequisites

The user must provide:
1. **Tool name** — the exact backend tool name, matching `entry.toolName` (e.g. `"news_get_headlines"`).
2. **Example output data** — sample wire events or a captured `ToolLifecycleEntry` so the renderer can be typed and built.

## Canonical contract

Every renderer is a React component with these props (from `@/features/tool-call-visualization/types`):

```tsx
interface ToolRendererProps {
  entry: ToolLifecycleEntry;
  events?: ToolEventPayload[];
  onOpenOverlay?: (initialTab?: string) => void;
  onOpenWindowPanel?: (initialTab?: string) => void;
  toolGroupId?: string;
  isPersisted?: boolean;
}
```

### `entry: ToolLifecycleEntry` — primary data source

From `@/features/agents/types/request.types`:

| Field | Meaning |
|---|---|
| `callId` | Unique tool invocation id. |
| `toolName` | Canonical backend tool name — **registry lookup key**. |
| `displayName` | Human label (may differ from `toolName` after reload). Never use for registry lookup. |
| `status` | `"started" \| "progress" \| "step" \| "result_preview" \| "completed" \| "error"`. |
| `arguments` | `Record<string, unknown>` — input args sent to the tool. |
| `startedAt` / `completedAt` | ISO timestamps. |
| `latestMessage` | Most recent human-readable progress line. |
| `latestData` | Most recent raw payload (tool-specific). |
| `result` | Final output (object, string, or null). |
| `resultPreview` | Short server-sent preview snippet. |
| `errorType` / `errorMessage` | Populated when `status === "error"`. |
| `isDelegated` | True for delegated/sub-agent calls. |
| `events` | The raw `ToolEventPayload[]` for this call, in server order. |

Terminal state: `status === "completed" || status === "error"`.

### `events: ToolEventPayload[]` — optional raw log

Same content as `entry.events`, but passed through as a prop so renderers that rely on per-step data (Brave search step tiles, deep-research read blocks) can consume it without re-extracting. Use this only when the inline summary needs information that isn't flattened into `entry.*`.

### Shell vs renderer responsibilities

`ToolCallVisualization` owns the **collapsed row** (verb-phrase label via registry `phaseLabels`, chevron, overlay/window buttons). Your inline component renders **only inside the expanded body**. Do not render a duplicate title row or status icons on the slim line — the shell handles state via tense + shimmer.

### `onOpenOverlay`, `onOpenWindowPanel`, `toolGroupId`, `isPersisted`

- `onOpenOverlay(tabId?)` — fullscreen overlay. Tab ids follow `tool-group-${callId}`.
- `onOpenWindowPanel(tabId?)` — same data in a draggable window panel (live requests group by `requestId`).
- `toolGroupId` — mirrors `entry.callId`; pass to both open callbacks.
- `isPersisted` — true for DB-loaded turns (`DbToolCard`). Terminal state only; `events` is usually empty today — parse `entry.result` as fallback for step-driven tools.

## Shared helpers

Import from `@/features/tool-call-visualization/renderers/_shared`:

```ts
collectMessages(events)      // string[] of all non-empty `message` fields
filterStepEvents(events, step?)  // tool_step events, optionally filtered by step name
getArg<T>(entry, key)        // typed getter for entry.arguments[key]
resultAsObject(entry)        // parses entry.result (handles JSON strings) → object or null
resultAsString(entry)        // stringifies entry.result for text search / regex
isTerminal(entry)            // status === "completed" || "error"
isSuccess(entry)             // status === "completed"
```

Use these instead of re-implementing extraction logic.

## Overlay shell

The feature wraps every overlay renderer in a `ToolGroupTab` that provides:

- A gradient header bar with tool name, subtitle, result count
- A toggle between **Results**, **Input**, and **Raw** views
- Support for custom header subtitle/extras via the registry entry

**CRITICAL:** your overlay component renders inside the Results tab only. It must not render its own header, title banner, or summary strip. Use `getHeaderSubtitle` / `getHeaderExtras` in the registry entry for anything that belongs in the header.

## File layout

```
features/tool-call-visualization/renderers/<kebab-tool-name>/
├── <Tool>Inline.tsx    # required
├── <Tool>Overlay.tsx   # optional — defaults to Inline when missing
└── index.ts            # barrel
```

Directory name is kebab-case. Component names are PascalCase and end in `Inline` / `Overlay`.

## Step-by-step

### 1. Create the directory and type the data

Analyze the example output. Type every field, including nested objects, optional fields, string fields that contain structured markdown/XML, and metadata. Put interfaces at the top of the file or in a local `types.ts` if they're shared between inline and overlay.

### 2. Write the inline renderer

`<Tool>Inline.tsx` — renders inside the **expanded** region of `ToolCallVisualization` (below the single-line transcript row).

Rules:
- `"use client";` directive.
- Implement `ToolRendererProps` from `@/features/tool-call-visualization/types`.
- Read `entry.status` for state — do not infer state from array shape. A running tool with no result is valid (`status === "started" | "progress" | "step" | "result_preview"`); show purposeful loading UI (not a bare spinner — see Loading states below).
- For event-driven tools, pass `events` through shared helpers rather than walking them manually. On persisted turns, `events` may be empty — also parse `entry.result`.
- Click handlers must call `e.stopPropagation()` (the shell header toggles expand/collapse).
- Handle missing images with `onError` fallbacks.
- Responsive grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.

Standard "View all" button:

```tsx
{isTerminal(entry) && onOpenOverlay && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onOpenOverlay(`tool-group-${toolGroupId ?? entry.callId}`);
    }}
    className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer animate-in fade-in slide-in-from-bottom"
  >
    View complete results
  </button>
)}
```

What the inline MUST show (inside the expanded body):
- The most important summary/preview of results.
- Key metrics or counts.
- A preview of primary content (analysis excerpt, top results).
- A preview of secondary content (first few source cards).
- Count of remaining items not shown inline.
- "View complete results" button when terminal (if an overlay adds value).

Do **not** duplicate the shell's verb-phrase row or add green-check / red-X status icons on the slim line.

### 3. Write the overlay renderer (when needed)

`<Tool>Overlay.tsx` — renders inside the fullscreen modal's Results tab. This is where ALL data lives.

Rules:
- `"use client";`.
- Implement `ToolRendererProps`.
- Do **not** render a header/title strip — use registry `getHeaderSubtitle` / `getHeaderExtras`.
- Derive parsed views from `[entry, events]` (React Compiler handles memoization — no manual `useMemo` required).
- Wrap content in `<div className="p-6 space-y-6 bg-background">`.
- Use semantic color variables (`bg-card`, `text-foreground`, `border-border`, `text-primary`, `text-destructive`, …) — they already handle dark mode.
- Empty states: icon + message.

Required UX features for data-rich overlays:
- View mode toggles (e.g. Analysis / Sources / Full Text).
- Per-section and full-export copy buttons.
- Collapsible sections for long text (`Show more` / `Show less` — never omit).
- Search / filter when >10 items.
- Sort when items have sortable attributes.
- External links always `target="_blank" rel="noopener noreferrer"` with Lucide `ExternalLink`.

### 4. Barrel

`<tool-name>/index.ts`:

```ts
export { ToolInline } from "./ToolInline";
export { ToolOverlay } from "./ToolOverlay"; // omit if no overlay
```

### 5. Register

Open `features/tool-call-visualization/registry/registry.tsx`, add an import, and add an entry to `toolRendererRegistry`:

```tsx
import { ToolInline, ToolOverlay } from "../renderers/<tool-name>";

// inside toolRendererRegistry:
"<exact_tool_name>": {
  toolName: "<exact_tool_name>",
  displayName: "Human Readable Name",
  phaseLabels: {                    // required for good slim-row UX
    running: "Doing the thing",
    complete: "Did the thing",
    errorPrefix: "Failed to do the thing",
  },
  resultsLabel: "Short Results Label",
  InlineComponent: ToolInline,
  OverlayComponent: ToolOverlay,    // optional — falls back to InlineComponent
  OverlayTabs: deepResearchOverlayTabs, // optional — replaces default Results tab
  keepExpandedOnStream: true,       // optional — start expanded so data streams in
  getHeaderSubtitle: (entry) => {
    const query = getArg<string>(entry, "query");
    return typeof query === "string" && query ? query : null;
  },
  getHeaderExtras: (entry, events) => {
    // return JSX to render in the overlay header (badges, counters, etc.)
    return null;
  },
},
```

`registerToolRenderer(toolName, renderer)` exists on the same module for runtime registration, but prefer the static `toolRendererRegistry` object for hardcoded tools so the registry is greppable.

### 6. Verify

- [ ] Inline shows meaningful preview data without opening the overlay.
- [ ] `entry.status` drives the loading/complete/error UI — not array position.
- [ ] "View complete results" button opens the correct tab.
- [ ] Overlay Results tab shows ALL data.
- [ ] Overlay does **not** render its own header.
- [ ] Registry `getHeaderSubtitle` / `getHeaderExtras` used for anything that belongs in the header.
- [ ] Dark mode works through semantic color variables.
- [ ] Empty states handled.
- [ ] No lint errors.

## Loading states for long-running tools

Generic spinners are not acceptable. Drive loading UI from real data whenever possible:

1. **Progressive status messages** from `entry.latestMessage` — the backend pushes human-readable progress lines. Display them directly.
2. **Step-driven progress** via `filterStepEvents(events, stepName)` — render per-step cards with metadata as it arrives.
3. **Per-item progress** when processing multiple items (URLs, queries): show each item as a card with its own phase and a completion checkmark.
4. **Aggregate waiting indicator** after individual items complete — cycle through realistic phase descriptions (3–7s random intervals) while waiting for the final result.
5. **Browsing / activity indicators** for URL-visiting tools — favicon + domain chips with pulsing active state.

See `features/tool-call-visualization/renderers/web-research/WebResearchInline.tsx` for the gold-standard implementation.

## Styling

Use semantic Tailwind color variables from `globals.css`. Do not hardcode hex/HSL or use generic shades like `blue-500`.

| Purpose | Class |
|---|---|
| Primary actions, links, active states | `text-primary`, `bg-primary`, `border-primary` |
| On-primary text | `text-primary-foreground` |
| Body text | `text-foreground` |
| Secondary / labels | `text-muted-foreground` |
| Card backgrounds | `bg-card` |
| Page background | `bg-background` |
| Subtle backgrounds | `bg-muted`, `bg-accent` |
| Borders | `border-border` |
| Success / warning / error / info | `text-success` / `text-warning` / `text-destructive` / `text-info` |

Opacity modifiers: `bg-primary/5`, `bg-primary/10`, `border-primary/20`, `text-foreground/80`.

Other conventions:
- Icons: Lucide React only.
- Cards: `bg-card rounded-lg border border-border`.
- Hover: `hover:border-primary/30 transition-colors`.
- Badges: `@/components/ui/badge`.
- Buttons: `@/components/ui/button`.
- Markdown rendering: `@/components/mardown-display/chat-markdown/BasicMarkdownContent`.

Animation classes with staggered delays for lists:

```tsx
style={{
  animationDelay: `${index * 80}ms`,
  animationDuration: "300ms",
  animationFillMode: "backwards",
}}
className="animate-in fade-in slide-in-from-bottom"
```

## Reference examples

| Tool | Folder |
|---|---|
| Deep research (event log + steps) | `features/tool-call-visualization/renderers/web-research/` |
| News headlines (clean `entry.result` only) | `features/tool-call-visualization/renderers/news-api/` |
| Brave search (pure step-event driven) | `features/tool-call-visualization/renderers/brave-search/` |
| SEO meta tags (header extras) | `features/tool-call-visualization/renderers/seo-meta-tags/` |
| RAG search (result-only, same inline+overlay) | `features/tool-call-visualization/renderers/rag-search/` |
| Deep research (custom OverlayTabs) | `features/tool-call-visualization/renderers/deep-research/` |

Read the registry entry for whichever example matches your tool shape most closely before writing code.

## Testing

- Live harness: `/demos/api-tests/tool-testing` — fires real tool calls against the backend and renders the results through the registry.
- Fixtures and preview components: `features/tool-call-visualization/testing/` (e.g. `ToolRendererPreview.tsx`, `stream-processing/`) — drop captured events in to render the renderer in isolation without a live backend.

## Final checklist

- [ ] Uses `entry.status` for state, never array position.
- [ ] `entry.arguments`, `entry.result`, `entry.errorMessage`, `entry.latestMessage` all surfaced where relevant.
- [ ] `events` only consumed when step-level info is needed.
- [ ] All imports point at `@/features/tool-call-visualization/*` (no legacy tool-renderer paths).
- [ ] Inline + overlay both implement `ToolRendererProps` directly.
- [ ] Barrel exports created.
- [ ] Registry entry added under the exact backend tool name.
- [ ] `getHeaderSubtitle` / `getHeaderExtras` used instead of a custom header.
- [ ] Dark mode verified via semantic variables.
- [ ] Empty and error states render.
- [ ] Lints clean.
