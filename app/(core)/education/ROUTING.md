# Education Hub — Routing Rules of Engagement

> **Read this before adding ANY route under `/education`.** It is the contract that keeps
> marketing, content, and the app tools coherent. The product source of truth is
> [`VISION-education-hub.md`](./VISION-education-hub.md); the feature doc is
> [`features/education/FEATURE.md`](../../../features/education/FEATURE.md). If something here
> drifts from the vision, **stop and flag the user** — do not invent a new pattern.

Everything lives under **`app/(core)/education/`** (guest-accessible, server-rendered, gets the
app shell + the returning-user header CTA). There are **three kinds** of route, and they do NOT
mix shapes.

---

## 1. The three layers

| Layer | Shape | Where | Rendering | Example |
|---|---|---|---|---|
| **Marketing / discovery** | **Nested** under an axis, data-driven `[slug]` | `education/<axis>/[slug]` | 100% server, SEO, `MarketingPageShell` | `education/study-aids/flashcards` |
| **SEO content** | Hierarchical catch-all | `education/learn/[...slug]` | 100% server, Article JSON-LD | `education/learn/biology/photosynthesis` |
| **Application tools** | **Flat** — one segment per tool + its own sub-routes | `education/<tool>/…` | server shell + client islands | `education/flashcards/[setId]/study` |

### The load-bearing rule: marketing is nested, the app is flat

A **tool is reached from many marketing angles** — the `biology` subject page, the
`study-aids/flashcards` page, and the `exam-prep/ap-biology` page **all link to the same flat
`education/flashcards`**. So:

- ✅ App tools are **flat**: `education/flashcards`, `education/fastfire`, `education/quizzes`…
- ❌ **Never** nest a tool under an axis: `education/study-aids/flashcards/all` is **wrong**.
- The marketing page (`education/study-aids/flashcards`) is a **billboard that links INTO** the
  flat tool (`education/flashcards`). That CTA is the conversion funnel.
- A study aid ≠ a feature. **FastFire**'s marketing is `education/features/fastfire`; its tool is
  `education/fastfire`. Don't conflate the marketing slug with the tool slug.

This mirrors how the leaders do it (Quizlet: content at `/explanations/…`, app at `/{id}/…`;
Knowt: content at `/exams/AP/AP-Biology`, app at `/flashcards`). Content pages are the deep
hierarchy; app routes are short, flat, and stable (good for sharing + SEO equity).

---

## 2. The canonical app-tool flow (the fundamental we standardize on)

Every tool that owns shareable items uses the **same** sub-route shape. This is modeled on
Google Docs (`/d/<id>/edit`) and Quizlet (`/<id>` + `/<id>/edit`): **a stable resource URL for
viewing/using, and a separate `/edit` segment for authoring.**

```
education/<tool>/                 Library — my items + shared-with-me        [gate: auth]
education/<tool>/new              Create → lands in the editor                [gate: auth]
education/<tool>/[id]             VIEW / USE — the shareable URL              [gate: VIEW]
education/<tool>/[id]/edit        EDIT / authoring                            [gate: EDIT]
education/<tool>/[id]/<use-mode>  study | take | results | play …             [gate: VIEW]
```

### Permission gating — why the split exists (do this on every tool)

The `[id]` view/use surface and the `[id]/edit` authoring surface share one resource identity but
are **gated differently**, which is what makes sharing clean:

- **`[id]` and its use-modes → gated by VIEW access.** Owner, org, a shared user, or public (per
  the item's `visibility` / share grant) can open and *use* it. This is the URL you share.
- **`[id]/edit` → gated by EDIT permission.** Only the owner or an editor-shared user. A
  view-only sharee who hits `/edit` is **redirected to `[id]`** (never a hard 404 for a resource
  they can see).
- **Library (`/`) + `/new` → require sign-in** (your own stuff).

Gate with the canonical access resolver — `iam.has_access(<resource>, '<action>')` via the
permissions registry (`utils/permissions/registry.ts`) and the sharing system
(`features/sharing/FEATURE.md`). **Do not roll a bespoke check.** The point of the separate
`/edit` segment is that the gate is one guard at one route, not scattered through a component.

> Coming-soon placeholders do **not** gate yet (no resource/permission to check). They reserve the
> route and document the surface + its gate via `<EduToolComingSoon slug surface={{label, gate}} />`.
> When the real surface is built, add the guard at that segment.

### Per-tool flow (current canonical map)

| Tool (flat slug) | Library | Create | View/use `[id]` | Edit | Use-modes |
|---|---|---|---|---|---|
| `flashcards` ✅ built | ✓ | `/new` ✓ | `/[setId]` ✓ | **`/[setId]/edit`** ⚠️ *missing* | `/[setId]/study` ✓ |
| `fastfire` ✅ built | launcher (`?set=`) | — | — (consumes sets) | — | — |
| `quizzes` | ✓ | `/new` | `/[id]` (take) | `/[id]/edit` | `/[id]/results` |
| `practice-tests` | ✓ | `/new` | `/[id]` (take) | `/[id]/edit` | `/[id]/results` |
| `tutor` | ✓ (recent) | — | `/[conversationId]` | — | — |
| `audio-study` | ✓ | `/new` | `/[id]` (player) | `/[id]/edit` | — |
| `mind-maps` | ✓ | `/new` | `/[id]` (map) | `/[id]/edit` | — |
| `notes` | ✓ | `/new` | `/[id]` (editor view) | `/[id]/edit` | — |
| `planner` | ✓ (dashboard) | — | — (personal) | — | — |

Everything except the built flashcards/fastfire surfaces is a **coming-soon placeholder** today —
the route exists, is self-documenting (shows its surface + gate), and graduates in place.

> ⚠️ **`flashcards/[setId]/edit` is the one gap in the built tool** — flashcards shipped
> library/new/`[setId]`/study but no dedicated edit surface. The flashcards agent should add
> `education/flashcards/[setId]/edit` (EDIT-gated) so sharing a deck read-only works cleanly.

---

## 3. Conventions (every route under `/education`)

- **Server-first.** Page files are Server Components. No `"use client"` on a `page.tsx` — push
  interactivity into a client leaf the page imports (Next code-splits it; `dynamic({ssr:false})`
  is illegal in a Server Component). Heavy browser-only clients (mic/canvas/katex) → `dynamic({
  ssr:false })` via a wrapper.
- **Metadata via the helpers.** Marketing/content: `createDynamicRouteMetadata` (with `keywords`
  + `canonicalPath`). Tools: `toolMetadata("<slug>")`. Never hand-roll `<title>`.
- **Marketing/content body markup → `SectionRenderer` only**, fed by the registries in
  `features/education/data/`. New block kind = extend the `EduSection` union + add one branch.
- **Coming-soon = `EduComingSoon` / `EduToolComingSoon`.** Never a bespoke "under construction".
- **Graduation in place.** A tool's real build *replaces* its coming-soon at the **same slug** —
  it never moves to a new path and never lands in `(transitional)`/`(legacy)`/a sibling feature.
- **Icons:** Lucide only, and **validate at runtime** — lucide dropped brand icons (`Youtube`…),
  which pass `tsc` but 500 the route (`node -e "console.log('X' in require('lucide-react'))"`).
- **No emojis** anywhere user-visible (enterprise).
- **Mobile:** `h-dvh`, `pb-safe`, `--header-height`, ≥44px tap targets, inputs ≥16px.

## 4. Where things live (don't scatter)

- Route files: `app/(core)/education/**` only. **Not** `(transitional)`, `(legacy)`, or a new
  top-level route.
- Tool feature code: its own `features/<tool>/` (e.g. `features/flashcards/`) is fine; the route
  file stays thin and imports from it.
- Registries (the data that drives marketing + tool placeholders): `features/education/data/`.
- Add a new tool → add an `EduToolEntry` to `data/tools.ts`, create `education/<tool>/page.tsx`
  + the canonical sub-routes above as placeholders, and update this file's per-tool table.

---

## 5. Current route tree

```
app/(core)/education/
├─ page.tsx                         Hub landing
├─ layout.tsx · loading.tsx · error.tsx
├─ ROUTING.md · VISION-education-hub.md
│
│  ── MARKETING AXES (nested, data-driven [slug], server, SEO) ──
├─ subjects/        page · [slug] · quick-math/(page,[id])   (quick-math = relocated stock lessons)
├─ levels/          page · [slug]
├─ exam-prep/       page · [slug]
├─ study-aids/      page · [slug]        ← billboards that link INTO the flat tools
├─ features/        page · [slug]
│
│  ── SEO CONTENT ENGINE (server, dynamic, JSON-LD) ──
├─ learn/           page · [...slug]
│
│  ── APPLICATION TOOLS (flat; view-gated [id] + edit-gated [id]/edit) ──
├─ flashcards/      page · new · [setId]/(page, study)   [needs: [setId]/edit]
├─ fastfire/        page (launcher, ?set=)
├─ quizzes/         page · new · [id]/(page, edit, results)
├─ practice-tests/  page · new · [id]/(page, edit, results)
├─ tutor/           page · [conversationId]
├─ audio-study/     page · new · [id]/(page, edit)
├─ mind-maps/       page · new · [id]/(page, edit)
├─ notes/           page · new · [id]/(page, edit)
├─ planner/         page
│
└─ admin/           page   (FeatureAdminMap)
```

---

## Change log
- **2026-06-29** — Created. Established marketing-nested vs app-flat; the canonical view/edit/use
  flow with VIEW-vs-EDIT permission gating (the previously-missing fundamental); stubbed the
  per-tool placeholder routes; flagged `flashcards/[setId]/edit` as the one gap in the built tool.
