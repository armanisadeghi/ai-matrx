# Education Hub — Routing Rules of Engagement

> **Read this before adding ANY route under `/education`.** It is the contract that keeps
> marketing, content, and the app tools coherent. The product vision is
> `common-docs/projects/education-platform/VISION.md` (the local `VISION-education-hub.md` is a
> pointer stub to it); the converged state — what is built, what is pending — is that project's
> `STATE.md`; the feature doc is
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

Gate with the P7 access primitive — **`requireAccess(type, id, level, {redirectTo})`** on the
server route (`[id]/edit` → redirect view-sharees to `[id]`) and **`useAccess(type, id)`** in the
view surface (to show "Make a copy" where level is `view`). Backed by `get_resource_access` over
`iam.has_access`; **do not roll a bespoke check.** Recipe: [`features/sharing/FEATURE.md`](../../../features/sharing/FEATURE.md) "View-vs-edit access gate". The point of the separate `/edit` segment is that the gate is one guard at one route, not scattered through a component.

> **No route renders a coming-soon placeholder today** — all 16 tools graduated to real surfaces.
> The `EduComingSoon` / `EduToolComingSoon` mechanism stays live for the *next* unbuilt tool: it
> reserves the route and documents the surface + its gate via
> `<EduToolComingSoon slug surface={{label, gate}} />`, and gets its guard when the real surface
> lands. Zero consumers is the success condition here, not dead code.

### Per-tool flow (current canonical map)

**Every tool below is BUILT and renders a real surface.** A `—` means the tool has no such surface
by design, not that it is unfinished.

| Tool (flat slug) | Library | Create | View/use `[id]` | Edit | Use-modes / extras |
|---|---|---|---|---|---|
| `flashcards` | ✓ | `/new`, `/new/from-source`, `/new/import` | `/[setId]` (VIEW-gated) | `/[setId]/edit` (EDIT-gated) | `/study` `/learn` `/test` `/write` `/match` `/sessions`; plus `/review`, `/weak-areas`, `/sessions`, `/sessions/[sessionId]`, `/progress` (→ `/education/progress`), `/admin` |
| `fastfire` | launcher (`?set=`) | — | — (consumes sets) | — | `/capture-test` (admin/dev harness) |
| `quizzes` | ✓ | `/new` | `/[id]` (take) | `/[id]/edit` | `/[id]/results` |
| `practice-tests` | ✓ | `/new` | `/[id]` (take) | `/[id]/edit` | `/[id]/results` |
| `tutor` | ✓ (recent) | `/new` | `/[conversationId]` | — | — |
| `audio-study` | ✓ | `/new` | `/[id]` (player) | `/[id]/edit` | `/review` (audio review session) |
| `mind-maps` | ✓ | `/new` | `/[id]` (map) | `/[id]/edit` | — |
| `memory` | ✓ | `/new` | `/[id]` | `/[id]/edit` | — |
| `notes` | ✓ | `/new` | `/[id]` | `/[id]/edit` | — |
| `summaries` | ✓ | — (converter-produced) | `/[id]` | — | index shipped 2026-08-20; `EDU_TOOLS` entry gives it the hub door |
| `planner` | ✓ (dashboard) | — | — (personal) | — | — |
| `progress` | ✓ | — | — (personal) | — | `/learning-gain` |
| `practice-oral` | ✓ (single surface) | — | — | — | — |
| `grade-work` | ✓ (single surface) | — | — | — | — |
| `game` | ✓ | `/host` | `/play/[roomId]` | — | `/join`, `/solo` |
| `classes` | ✓ | — (dialog) | `/[classId]` | — | `/join` |
| `family` | ✓ | — | `/[studentId]` (read-only) | — | — |
| `creator` | ✓ (dashboard) | — | — | — | public face is `/c/[handle]`, outside `(core)` |
| `library` | ✓ | — | — (browses `fc_set`) | — | `/suggestions` (owner inbox, linked from the library header) |
| `start` | — | onboarding hero | — | — | — |
| `data` | — | — | — | — | data-ownership / export / delete |
| `offline` | — | — | — | — | offline shell — doors: the queue-depth chip + `/education/data` |
| `media` | — | — | `/[id]` (kind router) | — | the canonical `study_media` entity route — see below |

**Admin-only routes:** `/education/admin`, `/education/flashcards/admin`, `/education/learn/admin`,
`/education/fastfire/capture-test`.

### The route graph is closed (THE DOOR LAW — fix on sight, never add to a gap list)

Every route under `/education` has at least one inbound link a user can click. The four gaps
recorded here on 2026-08-19 were all closed on 2026-08-20:

- **`/education/offline`** now has two doors. The always-available one is the **"Offline study &
  sync" card on `/education/data`**. The state-driven one is the **queue-depth chip** rendered by
  `OfflineStudySyncMount` (mounted in the education layout, so it is present on every route):
  when answers are waiting in the outbox it says how many and opens the offline surface — a count
  that describes records is a door. It renders nothing at zero, which is the normal state.
- **`/education/summaries`** is a real index (`SummaryHome` — the study-media library for
  `media_kind='summary'`, mirroring `MemoryHome`/`MindMapHome`), and `summaries` now has an
  `EDU_TOOLS` entry, so the hub's Study-tools grid links it automatically. It has **no `/new` by
  design**: a summary is produced by the ingest converter, so the empty state routes to
  `/education/start`.
- **`/education/media/[id]`** is **not** an id-only fallback — it is the **canonical route for the
  `study_media` entity token**, declared in
  [`features/education/data/entityRoutes.ts`](../../../features/education/data/entityRoutes.ts) and
  rendered as a link by every surface that lists tagged/generated content: the class hub
  (`useClassContent`, `useClassAssignments`, `ClassProgressPanel`) and the reverse-lineage chips
  (`convert/lineage.ts`). The typed routes (`/audio-study/[id]`, `/mind-maps/[id]`, `/memory/[id]`,
  `/summaries/[id]`) are the per-tool surfaces; `media/[id]` is the kind-agnostic URL a caller uses
  when it holds a `study_media` id and does **not** know the kind. Both are correct and both stay.
  **`MediaRouter` must handle every `EduMediaKind`** — a `summary` row used to fall through to the
  audio player, so every summary opened from a class or a lineage chip rendered an empty podcast
  surface. Add a branch here whenever a kind is added.
- **`/education/library/suggestions`** is linked from the **Community Library header**, for any
  signed-in visitor, with the count of open suggestions on their own decks. It was previously
  reachable only from the admin route map, which meant the suggest-edit flywheel's owner half had
  no door at all.

> ✅ **`flashcards/[setId]/edit` is built + EDIT-gated** (P7, 2026-07-07): `requireAccess("fc_set",
> setId, "edit", { redirectTo })` redirects a view-only sharee to the view page, which offers
> "Make a copy" (`DuplicateToEditButton`). This is the reference wiring — gate every tool the same
> way with `useAccess` / `requireAccess` (see [`features/sharing/FEATURE.md`](../../../features/sharing/FEATURE.md) "View-vs-edit access gate").

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

**Verified against the filesystem 2026-08-20.** Every entry has a real `page.tsx` rendering a real
surface. If you add or remove a route, update this tree in the same change.

```
app/(core)/education/
├─ page.tsx                         Hub landing (data-driven off EDU_TOOLS)
├─ layout.tsx · loading.tsx · error.tsx · ROUTING.md · VISION-education-hub.md (pointer stub)
│
│  ── MARKETING AXES (nested, data-driven [slug], server, SEO) ──
├─ subjects/        page · [slug] · quick-math/(page, [id])
├─ levels/          page · [slug]
├─ exam-prep/       page · [slug]
├─ study-aids/      page · [slug]        ← billboards that link INTO the flat tools
├─ features/        page · [slug]
│
│  ── SEO CONTENT ENGINE (server, dynamic, JSON-LD) ──
├─ learn/           page · [...slug] · admin (admin-only authoring + exam pipeline)
│
│  ── APPLICATION TOOLS (flat; view-gated [id] + edit-gated [id]/edit) ──
├─ flashcards/      page · new/(page, from-source, import) · [setId]/(page, edit, study, learn,
│                   test, write, match, sessions) · review · weak-areas · sessions/[sessionId]
│                   · progress (redirect) · admin
├─ fastfire/        page (launcher, ?set=) · capture-test (admin/dev)
├─ quizzes/         page · new · [id]/(page, edit, results)
├─ practice-tests/  page · new · [id]/(page, edit, results)
├─ tutor/           page · new · [conversationId]
├─ audio-study/     page · new · review · [id]/(page, edit)
├─ mind-maps/       page · new · [id]/(page, edit)
├─ memory/          page · new · [id]/(page, edit)
├─ notes/           page · new · [id]/(page, edit)
├─ summaries/       page · [id]
├─ media/           [id]                    (canonical study_media entity route)
├─ planner/         page
├─ progress/        page · learning-gain
├─ practice-oral/   page
├─ grade-work/      page
├─ game/            page · host · join · solo · play/[roomId]
├─ classes/         page · join · [classId]
├─ family/          page · [studentId]
├─ creator/         page                     (public face: /c/[handle], outside (core))
├─ library/         page · suggestions
├─ start/           page
├─ data/            page
├─ offline/         page
│
└─ admin/           page   (FeatureAdminMap)
```

---

## Change log
- **2026-08-20** — The four route-graph gaps are CLOSED. Added `/education/summaries` (index +
  `EDU_TOOLS` entry), the Community Library's suggestion-inbox door (with open count), the offline
  surface's two doors (the `/education/data` card + the outbox queue-depth chip), and recorded
  `media/[id]` as the canonical `study_media` entity route rather than a dead end. Fixed
  `MediaRouter`, which dispatched `summary` rows to the audio player.
- **2026-08-19** — Rewritten against the filesystem during the Education doc convergence. The
  headline claim that "everything except flashcards/fastfire is a coming-soon placeholder" was
  false for every tool; the per-tool table listed 9 tools against 21+ on disk; the route tree was
  missing `[setId]/edit` (shipped 2026-07-07) plus ~40 other routes. Added the four known
  route-graph gaps and the admin-only list. Converged state:
  `common-docs/projects/education-platform/STATE.md`.
- **2026-07-07** — P7: the view/edit gate is real. `flashcards/[setId]/edit` is EDIT-gated via
  `requireAccess`; `[setId]` view surface offers duplicate-to-edit for view-only sharees. Gating
  primitive is `useAccess`/`requireAccess` (`utils/permissions`); indexable public resources live
  at `/p/e/[resourceType]/[id]`.
- **2026-06-29** — Created. Established marketing-nested vs app-flat; the canonical view/edit/use
  flow with VIEW-vs-EDIT permission gating (the previously-missing fundamental); stubbed the
  per-tool placeholder routes; flagged `flashcards/[setId]/edit` as the one gap in the built tool.
