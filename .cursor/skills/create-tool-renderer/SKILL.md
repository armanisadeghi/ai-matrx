---
name: create-tool-renderer
description: Create a custom display for an MCP/agent tool's result in the chat interface — the rich UI shown when a tool call expands. Default path is a DB-LOADED renderer (agent-authored React code stored in the `tool_ui` table, compiled at runtime); a hardcoded in-repo renderer is the rare escape hatch. Use when the user wants to add/customize a tool visualization, make a tool result look good, render MCP tool output, or "author a renderer" for a tool that currently shows the generic view.
---

# Create Tool Renderer

Make a tool call render as a first-class, beautiful surface instead of the generic JSON view. Two paths — **default to the DB path.**

| Path | When | Where the code lives |
|---|---|---|
| **A — DB renderer (default, ~90%)** | Any tool. Author once, renders everywhere, no repo deploy. | `tool_ui` table (runtime-compiled) |
| **B — Hardcoded renderer (escape hatch, ~10%)** | A genuinely interactive/heavy widget that needs full repo imports. | `features/tool-call-visualization/renderers/` + registry |

**Resolution order: in-code registry → DB renderer → generic.** A DB renderer only renders for a tool with NO in-code registry entry. Architecture: [`features/tool-call-visualization/FEATURE.md`](../../../features/tool-call-visualization/FEATURE.md).

## Cardinal rule: HIDE NOTHING

Every field in the result surfaces somewhere. Inline = the key info at a glance (truncation OK with a "view all"); overlay = every field, nested object, source, metadata (long text collapses with "Show more", never omitted).

## The contract (BOTH paths)

A renderer is a React component taking `ToolRendererProps` (from `@/features/tool-call-visualization/types`):

```tsx
interface ToolRendererProps {
  entry: ToolLifecycleEntry;
  events?: ToolEventPayload[];
  onOpenOverlay?: (initialTab?: string) => void;
  onOpenWindowPanel?: (initialTab?: string) => void;
  toolGroupId?: string;
  isPersisted?: boolean;
  conversationId?: string;
}
```

`entry` is the data (from `@/features/agents/types/request.types`): `toolName` (registry key), `status` (`started|progress|step|result_preview|completed|error`), `arguments` (input), `result` (final output — object, JSON string, or null), `latestMessage`, `errorMessage`, `events`. **Terminal = `status === "completed" || "error"`.** Drive UI from `entry.status`, never from array shape — a running tool with no result yet is valid.

**The shell owns the collapsed row** (label from `tool_ui.display_name` / registry, subtitle, chevron, overlay/window buttons). Your component renders **only the expanded body** — no duplicate title row, no green-check/red-X status icons (state is conveyed by tense + shimmer on the row).

---

## Path A — DB renderer (default)

Agent-authored component code stored in `tool_ui`, fetched by `tool_name` + surface, compiled at runtime through the proven Agent Apps Babel sandbox (`db-renderer/` → `compileSlotComponent`). This is how most tools should be customized: no repo deploy, works for agent- and user-authored renderers, scales to every platform.

### The component

A single self-contained default export. Import lines are **stripped** — identifiers come from the sandbox scope, so you can't import helpers from the repo:

```tsx
import { Folder, FileText } from "lucide-react"; // (stripped; icons come from scope)

export default function FsListRenderer({ entry }) {
  // Inline your OWN helpers — `_shared`, `@/lib/*`, etc. are NOT in scope.
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  const out = asObj(entry && entry.result);          // result may be a JSON string
  const entries = Array.isArray(out.entries) ? out.entries : [];
  if (entry && entry.status !== "completed" && entries.length === 0)
    return <div className="text-sm text-muted-foreground">Listing…</div>; // streaming state
  if (!entries.length) return <div className="text-sm text-muted-foreground">Empty.</div>;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      {entries.map((e, i) => (
        <div key={(e && e.path) || i} className="flex items-center gap-2 px-2.5 py-1.5">
          {e.is_dir ? <Folder className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
          <span className="truncate text-sm text-foreground">{e.name}</span>
        </div>
      ))}
    </div>
  );
}
```

### Sandbox scope (what you CAN use)

Set by `allowed_imports`. The allow-list lives in `features/agent-apps/utils/allowed-imports.ts` — do not assume anything outside it:

- **`react`** — always: `React`, `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`.
- **`lucide-react`** — always when listed: ALL icons by name (a missing icon name renders a safe placeholder, never a crash).
- Optional UI when listed: `@/components/ui/{button,input,textarea,card,label,select,slider,switch,tabs}`, `@/components/MarkdownStream` (as `MarkdownStream`/`Markdown`).
- **Forbidden:** arbitrary npm, `fetch`/network, the repo's `_shared` helpers, `@/lib/*`. Inline what you need. Plain JS only (the sandbox runs JS — TS types are fine in source but carry no runtime guarantee).

Default `allowed_imports`: `["react", "lucide-react"]`. Add a UI path only if you use it.

### The `tool_ui` row

| Column | Required | Meaning |
|---|---|---|
| `tool_name` | ✓ | Exact backend tool name (`entry.toolName`). |
| `surface_name` | ✓ | **MUST be `matrx-default/default`** (`WEB_TOOL_UI_SURFACE`, `db-renderer/surface.ts`) — the only surface the web app reads. |
| `display_name` | ✓ | Collapsed-line label (e.g. "Weather", not "Travel Get Weather"). |
| `inline_code` | ✓ | The component above. |
| `header_subtitle_code` | | `export default function(entry, events) { return string }` — collapsed-line subtitle. Omit and the shell shows the most informative arg (`path`/`command`/`city`/`key`/`query`/…). |
| `overlay_code` | | Optional richer full-screen variant; defaults to inline. |
| `results_label` | | Noun for the result tab (e.g. "entries"). |
| `allowed_imports` | ✓ | Default `["react","lucide-react"]`. |
| `contract_version` | ✓ | `2`. |
| `is_active` | ✓ | `true`. |

A DB renderer is **fully self-describing**: `display_name` → label, `header_subtitle_code` → subtitle, `inline_code` → body.

### Three ways to author (pick one)

1. **Admin UI** — `/administration/mcp-tools/[toolId]/ui`: *Generate* tab (AI generator, prompt at `features/tool-call-visualization/admin/tool-ui-generator-prompt.ts`), *Edit Code* tab (manual + live compile errors), *Preview* tab (renders against `tool_test_sample` fixtures). Saves via `POST /api/admin/tool-ui-components` (defaults to the correct surface).
2. **The renderer-author agent** — the AI Matrx agent specialized for this (invoke via the agent MCP / `agent_run`). Hand it the tool name + a sample result; it writes the row.
3. **A seed migration** — idempotent `INSERT … ON CONFLICT (tool_name, surface_name) DO UPDATE` into `tool_ui` (the reference set in `migrations/tool_ui_db_renderer_examples*.sql` is the template). Apply via the Supabase MCP + record in `_schema_migrations`.

### Verify (DB path)

- **Gallery** — add a fixture to `app/(dev)/demos/tool-viz/result-fields/page.dev.tsx` (`DB_RENDERER_ENTRIES`) and load `/demos/tool-viz/result-fields` → "DB-loaded renderers". This is the real path (fetch → compile → render).
- **Real chat** — run the tool; it renders inline. Reload to confirm the persisted path.
- If it falls back to generic: check the tool has NO in-code registry entry (registry wins), `surface_name = matrx-default/default`, `is_active = true`, and the code compiles (admin *Edit Code* tab shows compile errors).

---

## Path B — Hardcoded renderer (escape hatch)

Only when the tool needs full repo imports or heavy interactivity. Full power, but ships in the bundle and needs a deploy.

```
features/tool-call-visualization/renderers/<kebab-tool-name>/
├── <Tool>Inline.tsx    # required — "use client"; ToolRendererProps
├── <Tool>Overlay.tsx   # optional — defaults to Inline
└── index.ts            # barrel
```

Here you CAN import the shared helpers from `@/features/tool-call-visualization/renderers/_shared` (`resultAsObject`, `collectMessages`, `filterStepEvents`, `getArg`, `isTerminal`, `isSuccess`) and anything else in the repo. Register in `features/tool-call-visualization/registry/registry.tsx`:

```tsx
import { ToolInline, ToolOverlay } from "../renderers/<tool-name>";
// inside toolRendererRegistry:
"<exact_tool_name>": {
  toolName: "<exact_tool_name>",
  displayName: "Human Readable Name",
  phaseLabels: { running: "Doing the thing", complete: "Did the thing", errorPrefix: "Failed to do the thing" },
  resultsLabel: "Results",
  InlineComponent: ToolInline,
  OverlayComponent: ToolOverlay,        // optional
  keepExpandedOnStream: true,           // optional — open expanded while streaming
  getHeaderSubtitle: (entry) => getArg<string>(entry, "query") ?? null,
},
```

The overlay renders inside the Results tab only — never render your own header; use `getHeaderSubtitle` / `getHeaderExtras`.

Reference examples (read the registry entry for the closest shape first): `renderers/web-research/` (event log + steps), `renderers/news-api/` (clean `result`), `renderers/brave-search/` (step-event driven), `renderers/sql/` (sparse data done right).

---

## Styling (BOTH paths)

Semantic Tailwind tokens only — no hex/HSL, no `blue-500`. Lucide icons only, no emoji.

| Purpose | Class |
|---|---|
| Primary / links / active | `text-primary`, `bg-primary`, `border-primary` |
| On-primary text | `text-primary-foreground` |
| Body / secondary | `text-foreground` / `text-muted-foreground` |
| Card / page / subtle bg | `bg-card` / `bg-background` / `bg-muted` |
| Borders | `border-border` |
| Success / warn / error | `text-success` / `text-warning` / `text-destructive` |

Cards: `bg-card rounded-md border border-border`. Opacity modifiers OK (`bg-primary/10`). External links: `target="_blank" rel="noopener noreferrer"` + Lucide `ExternalLink`.

## Final checklist

- [ ] Drives UI from `entry.status`; handles the streaming (not-yet-complete) state.
- [ ] Parses `entry.result` defensively (string-or-object); `result` / `arguments` / `errorMessage` surfaced where relevant.
- [ ] No duplicate title row / status icon on the slim line (the shell owns it).
- [ ] **DB path:** only sandbox-scope identifiers used; helpers inlined; row on `surface_name = matrx-default/default`, `contract_version = 2`, `is_active = true`; `display_name` set; verified in the gallery.
- [ ] **Hardcoded path:** barrel + registry entry under the exact tool name; `getHeaderSubtitle`/`getHeaderExtras` instead of a custom header.
- [ ] Semantic tokens; dark mode implicit; empty + error states render; lints clean.
