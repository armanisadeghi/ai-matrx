---
name: code-splitting
description: >-
  Split heavy CLIENT code out of the bundle with `next/dynamic({ ssr: false })` the right way.
  Use BEFORE adding a dynamic import, making a component "lazy", deferring a heavy widget, cutting
  bundle/first-load size, fixing a "window is not defined" / hydration mismatch on a browser-only
  component, or reaching for `React.lazy`. Triggers on `next/dynamic`, `dynamic(`, `ssr: false`,
  `React.lazy` / `lazy(`, `loading:`, "code split", "lazy load", "defer this", "make this not
  load on every page", "heavy client component", "shrink the bundle", or wrapping a heavy core in
  a thin shell. Read this whenever a task touches how a component enters (or stays out of) a chunk.
---

# code-splitting — `next/dynamic` done right

One job: keep heavy **client** code out of the server render and out of the initial load, fetching its chunk only when actually needed. Done wrong it's pure cost (extra waterfalls, blank screens, hydration mismatches) with none of the win.

## The one mental model

`dynamic(() => import(...))` does **three separable things**. Confusing them is every mistake below:

1. **Creates a separate chunk** — happens always, just from the `import()`. Not "in the main bundle."
2. **`ssr: false` → excludes it from the server render** — happens whenever you pass `ssr:false`, conditional or not. This is what keeps browser-only deps (anything touching `window`, canvas, editors, jspdf, maps) off the server and kills hydration mismatches.
3. **Defers the *client* fetch until render** — only pays off when the component is **conditionally rendered**. Render it unconditionally on mount and the chunk fetches immediately anyway — often as an extra waterfall.

So `dynamic()` itself saves nothing. The **`ssr:false`** earns benefit #2; the **condition you render it behind** earns benefit #3. Name which one you're after before you write it.

## The five rules

1. **A Server Component cannot use `dynamic({ ssr: false })`.** Next.js throws. A server file stays a thin static shell; the heavy widget *below* it owns its own splitting inside a `"use client"` child. See the prose contract in [app/Providers.tsx](app/Providers.tsx) — it documents exactly this.

2. **Never stack `ssr:false` boundaries down one render path.** One boundary covers everything beneath it. A second one close below = a sequential **waterfall** (load chunk A → only then discover & fetch chunk B), a fragmented chunk graph, and **zero** extra benefit. See the warning baked into [lazyOverlay.tsx](features/overlays/boundary/lazyOverlay.tsx).

3. **`next/dynamic` ≠ `React.lazy`. Always use `next/dynamic`.** Only `next/dynamic` supports `ssr:false`, a built-in `loading`, and named-export handling. `React.lazy` SSRs by default, needs your own `<Suspense>`, and **cannot** keep browser-only code off the server. `React.lazy` / `lazy(` in this repo is tech debt — replace it when you touch it.

4. **A dynamic import without a condition does nothing (benefit #3).** If you `dynamic()` something and then always render it, you paid the split cost for no deferral. Gate it (modal open, tab, route, `useIdleReady`, feature flag) — or, if it genuinely must always be live, keep it only for the `ssr:false` reason (benefit #2) and say so.

5. **`loading` and an error boundary are not optional for user-triggered chunks.** A bare `dynamic()` whose chunk stalls or fails renders **nothing**, silently. For overlays/windows that's solved for you — see Method B. Elsewhere, at minimum pass `loading: () => …` (use `() => null` only when nothing-until-ready is correct).

## Two ways to do it

### Method A — split in place (conditional)

The consuming **client** component declares the dynamic component at module scope and renders it **only behind a condition**. Best when one component conditionally reveals something heavy.

```tsx
"use client";
import dynamic from "next/dynamic";

const RecoveryWindowImpl = dynamic(() => import("./RecoveryWindowImpl"), {
  ssr: false,
  loading: () => null,
});

export function RecoveryWindow() {
  const { isOpen } = useRequestRecovery();
  if (!isOpen) return null;        // ← the condition is the whole point
  return <RecoveryWindowImpl />;
}
```

Real exemplars: [RecoveryWindow.tsx](features/request-recovery/components/RecoveryWindow.tsx) (gated on `isOpen`), [DeferredIslands.tsx](features/shell/islands/DeferredIslands.tsx) (three imports behind **one** `useIdleReady` gate — batch, don't fan out boundaries).

### Method B — split once in a wrapper (the "front door")

For a heavy component used in **many** places, don't make every callsite remember to `dynamic()` it. Do the split **once** in a wrapper and:

- **Export only the wrapper.** Rename the heavy core to something nobody would import — convention here is **`*Impl`**.
- **Export the props type from the wrapper shell**, so consumers get types without pulling the impl into their graph.

```tsx
// MarkdownStream.tsx — the only importable name
import dynamic from "next/dynamic";
export interface MarkdownStreamProps { /* … types live in the shell … */ }

const MarkdownStream = dynamic(() => import("./MarkdownStreamImpl"), { ssr: false });
export default MarkdownStream;          // MarkdownStreamImpl is never imported directly
```

Real exemplars:
- [MarkdownStream.tsx](components/MarkdownStream.tsx) → `MarkdownStreamImpl` — the canonical case. Hides a huge rich-document engine; type lives in the shell.
- [UploadGuardHost.tsx](features/files/upload/UploadGuardHost.tsx) → `*Impl` — wrapper also re-exports the **imperative API** (`requestUpload`) statically, so callers get the API without the dialog tree. (Always-rendered host: benefit #2 only — that's the right call for an app-shell singleton.)
- [lazyOverlay.tsx](features/overlays/boundary/lazyOverlay.tsx) — the **system-level** Method B: one primitive wraps ~90 overlays with `ssr:false` + canonical `loading` + error boundary + a load-timeout that converts a hung `import()` into a catchable error. **Every overlay/window goes through `lazyOverlay`, never a bare `dynamic()`.** (See the `overlay-system` and `window-panels` skills.)

**Pick B when:** the component is heavy AND used in 2+ places, OR it's a singleton host, OR it must stay off the server render everywhere. **Pick A** for a one-off conditional reveal.

## What NOT to do — verified anti-patterns

| Anti-pattern | Where | Why it's wrong |
|---|---|---|
| **Stacked `ssr:false` on one path** | [MessageItem.tsx:7](features/chat/components/response/MessageItem.tsx#L7) `dynamic(AssistantMessage)` → which renders `MarkdownStream` (itself `dynamic ssr:false`) | Two boundaries, one render path → extra waterfall. `AssistantMessage` also renders for **every** assistant message, so benefit #3 ≈ 0. Fix: import `AssistantMessage` statically; the `MarkdownStream` boundary beneath already does the heavy split. |
| **Dynamic but unconditional** | same file — `AssistantMessage` always renders when `role !== "user"` | Chunk fetches on every chat open regardless. Split cost, no deferral. |
| **`React.lazy` instead of `next/dynamic`** | [organizations/peek/registry.ts](features/organizations/peek/registry.ts), several `features/settings/tabs/*` | No `ssr:false`, no `loading`, manual Suspense. Use `next/dynamic`. |
| **`dynamic({ssr:false})` in a Server Component** | guarded against in [app/Providers.tsx](app/Providers.tsx) | Build error. Push the dynamic import into a `"use client"` child. |
| **Bare `dynamic()` for an overlay/window** | — | Bypasses `loading`/error/timeout. Use `lazyOverlay`. |

## Build-time bloat — the recurring leak: hunt it, then guard it

> **Unexplained build-time growth is almost always THIS, not "big packages."** A heavy client module imported **statically** into a path that lands in many chunks — a Server Component, a root layout/provider, a widely-imported shared client component, or a barrel — forces that weight into every one of those chunks, and Turbopack pays to compile it everywhere. Canonical incident: `UnifiedAgentContextMenu` reverted from `dynamic({ssr:false})` to a static `import { … }` on 5 surfaces and ballooned the prod build **15 → 24 min**. Agents keep misdiagnosing this as package size; it is not. When the build grows for no obvious reason, hunt the leak FIRST.

**The leak signature** — a STATIC value import (`import { X } from "…"` / `import X from "…"`; NOT `import type`, NOT `dynamic(() => import(…))`) of a heavy client-only module, in a high-blast-radius file. Strongest tell: **a `dynamic()` import of the same module already exists elsewhere** — someone bypassed the established split.

**Rank a find by blast radius:** (1) a **Server Component** (no top `"use client"`) importing client-heavy code — worst, pulls it into the RSC/server graph; (2) a **root/shared shell** imported by many routes (`app/**/layout.tsx`, `app/Providers*.tsx`, `providers/**`, shell components); (3) a route `page.tsx` importing a heavy widget statically; (4) a **barrel** (`index.ts`) re-exporting a heavy module — every importer drags it.

**Hunt method (offload the sweep, verify the gold yourself):** list heavy deps (editors/monaco/codemirror/tiptap, reactflow/xyflow, recharts/d3, pdfjs, three, mermaid, syntax highlighters, livekit, emoji/color pickers) + heavy internal components (the context menu, code workspace, workbook, canvas/artifacts) → ripgrep their static import sites → classify each by the blast-radius list → flag any whose module is dynamically imported elsewhere. Give an `Explore` subagent that spec and ask for a ranked `file:line` treasure map; then verify the top finds yourself before fixing.

**Guard it so it can't silently come back (the platform move).** Patching the 5 sites is the artifact; making the class extinct is the platform. For each heavy client component, add an eslint `no-restricted-syntax` ban on its STATIC value import that still allows `import type` + dynamic `import()`. Reference implementation: `canonicalMenuStaticImportBan` in [eslint.config.mjs](eslint.config.mjs):

```
"ImportDeclaration[importKind!='type'][source.value='@/…/Heavy'] > ImportSpecifier[importKind!='type'][imported.name='Heavy']"
```

Now there are two loud layers — the lint guard (fails at commit/CI) and this doctrine — so the day someone re-adds a static import, lint screams instead of the build silently growing 10 minutes over a month.

## Before you ship — checklist

- [ ] **Which benefit am I buying?** `ssr:false` (off the server) and/or a real **condition** (deferred fetch). If neither, delete the `dynamic()` and import statically.
- [ ] **Is there already an `ssr:false` boundary above me on this path?** If yes, import statically — don't stack.
- [ ] **Server Component?** Then no `ssr:false` here — move it into a client child.
- [ ] **Many callsites / a singleton / a heavy core?** Use Method B (`*Impl` + wrapper + type in the shell), not a `dynamic()` at every site.
- [ ] **`React.lazy`?** Replace with `next/dynamic`.
- [ ] **User-triggered?** Has a `loading` fallback (overlays/windows → `lazyOverlay`, which adds error + timeout too).
