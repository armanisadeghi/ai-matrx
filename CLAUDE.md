# CLAUDE.md — AI Matrx Admin

Large-scale Next.js no-code AI app builder and admin dashboard. Desktop-first, mobile-responsive.

> **Official Next.js / React / TypeScript best practices:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md` — single source of truth for rendering, caching, performance, mobile, Tailwind, component contracts, API patterns. This file covers project-specific conventions only.

---

## Operating Principle: Build the platform, not the artifact.

> **The artifact is disposable. The class of failure goes extinct. Friction is the spec for your next primitive.**

Every task is a probe exposing what the platform is missing. Build (or extend) the missing generic, named, documented primitive, then complete the task by consuming it. **Forbidden:** code that only serves this one artifact. **Required:** reusable primitives.

**Acceptance tests** — *Feature:* could you rebuild it in minutes from existing capabilities? *Bug:* is this whole class of failure now structurally impossible, not just patched here? *Adding a type/component/slice/hook:* did you prove (grep / read / `Explore` subagent) no existing primitive could be extended? If no, the remainder is your next infrastructure ticket — extract it.

The five anti-patterns this kills (local types, recreated components, parallel Redux slices, duplicated hook logic, the agent-mindset trap) with "look here first" anchors: **[PRINCIPLES.md](./PRINCIPLES.md)**. Enforced by ESLint ([`eslint.config.mjs`](./eslint.config.mjs)), `pnpm check:doctrine` ([script](./scripts/check-doctrine.ts)), and the pre-commit hook. Every `FEATURE.md` has a Doctrine section ([template](./features/_FEATURE_TEMPLATE.md)).

---

## Web Access for Testing

- User: `admin@admin.com` / `Password1234#`
- Dev auto-login (localhost only, disabled in production): `http://localhost:3000/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/<route>` — `next` defaults to `/dashboard`. If a session exists, it redirects without re-login.

---

## Architecture

**Stack:** Next.js 16.1 (App Router) · React 19.2 · TypeScript 5.9 (strict, no `any`) · Tailwind 4.1 (CSS-first, `@theme`) · Turbopack · pnpm 10.28 · Vercel hosting.
**Mobile:** Expo 54 / RN 0.81 / React 19.1 — iOS 26+ (Liquid Glass), Android 16+ (Material 3 Expressive). LiveKit for AV (requires `expo prebuild`).
**Payments:** Stripe.

Always use the latest stable release of every package — no deprecated APIs.

### Data flow — there is no Next.js middle tier

- **Reads/writes:** React client → Supabase directly. Do NOT route data ops through Next.js API routes or Server Actions.
  - *Exception:* admin-only operations gated by a secret token.
- **Compute ("the brain"):** Python backend at `https://server.app.matrxserver.com`. React calls it directly for all complex server work.
- **Next.js API routes never sit between React and Python.** That's an unnecessary network hop. Reserve API routes for true Next.js-only concerns (secret-token admin RPCs, webhooks, OG images, the agent feedback MCP/REST surface).
- **Python microservices** beyond the main backend only when TS hits a real capability wall (heavy PDF/OCR, bulk stats, local NLP at scale, advanced media). Sit them behind the Python backend, never behind Next.js.

### Core invariants

- Server Components by default; Client Components only when interactive.
- Dynamic rendering by default; opt into caching with `'use cache'` + `cacheTag()` / `revalidateTag()`.
- React Compiler is on — no manual `useMemo` / `useCallback` / `React.memo`.
- `proxy.ts` (not `middleware.ts`) — auth, route guards, redirects only.
- **State:** Redux RTK for all global state. Extend existing slices; never spin up parallel or local state.
- **Types:** Supabase-generated types are the source of truth. End-to-end type-safe, strict, no `any`.
- **Realtime:** Supabase Broadcast for ephemeral messaging/presence; Postgres Changes only when RLS-driven authorization is required.
- **Errors:** every async op has structured error handling. Never swallow.

### Development Rules

- Build Protective & Recovery Layers, but ensure Loud recovery. Every recovery/fixer layer screams when it fires, because a recovery firing means a real bug got past the proactive layer.


### Supabase

- **Project:** `txzxabzwovsujtloxrus` (Matrx Main, `us-west-1`, Postgres 17). The only DB this repo talks to. `NEXT_PUBLIC_SUPABASE_URL` → `db.matrxserver.com`. Always pass `project_id: "txzxabzwovsujtloxrus"` to Supabase MCP tools — do not guess between Matrx Main / My Matrx / Matrx Flow / Matrx DM / Matrx Games.
- **Clients:** `@/utils/supabase/client` (browser), `@/utils/supabase/server` (SSR). `createAdminClient()` is restricted — see Protected Resources.

### Database migrations — the DB is the source of truth, NOT the files

> A `.sql` file in `migrations/` changes **nothing** until applied to Supabase — writing one and reporting "done" is the single most damaging mistake here. A migration is done only when **applied AND verified live AND `pnpm db-types` regenerated.**

The app code has **no DDL path** (Supabase JS / PostgREST only). Agents apply DDL through the **Supabase MCP** (`apply_migration` / `execute_sql`), always available and gated to `project_id: "txzxabzwovsujtloxrus"`. Cross-repo system:
- **Shared ledger** `public._schema_migrations` (key `(source, filename)`) records every applied migration across aidream / matrx-frontend / matrx-extend (one shared DB).
- **Verify (loud):** `pnpm check:migrations` diffs `migrations/*.sql` vs the ledger (`source='matrx-frontend'`) and screams in a red box about anything unapplied or **drifted** (file changed since it was recorded); runs on every commit (non-blocking); `:strict` exits non-zero for CI.
- **Apply:** run the migration via the Supabase MCP `apply_migration`. Migrations MUST be **idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`) so re-applying a drifted file is safe. **Then record it** — `check:migrations` stays red until the ledger row matches: insert/update `_schema_migrations` (`source='matrx-frontend'`, `filename`, `checksum` = SHA-256 of the file bytes). aidream's `python db/apply_migrations.py --source matrx-frontend` is the batch applier for that repo and records the ledger itself; from here, the MCP one-off + ledger write is the path.
- **Verify live:** a file means nothing until applied — confirm the column/function/trigger actually exists with an `execute_sql` query before reporting done.
- After applying: `pnpm db-types` → `types/database.types.ts` (or `pnpm sync-types` for DB + Python API types + type-check).
- A migration that must never apply gets `-- migrate: skip: <reason>` in its first 25 lines.

**Invoke the `finalize-and-ship` skill** at the end of any task — it runs migrations + type sync + the other pre-push checks before committing.

---

## File Organization

- General: `/components`, `/hooks`, `/utils`, `/constants`, `/types`, `/providers`.
- Features: `/features/[name]/` with `types.ts`, `components/`, `hooks/`, `service.ts`, `utils.ts`, `constants.ts`, `state/` (or `redux/`).
- Route → feature: `app/(core)/notes/page.tsx` → `features/notes/`.
- Never write to project root. One `README.md` per feature, only after the code is tested.
- **Barrel files (`index.ts` re-exports) are being eliminated.** Don't create new ones. Import from source. ESLint enforces. Replace existing barrels opportunistically when editing a file.

**Do not invent new top-level features.** A feature is a big, distinct piece of app functionality, usually with multiple routes. Introducing one is the user's call, not yours. Default to extending an existing feature; if a new feature seems genuinely warranted, ask first.

### Route groups (2026-05-26 reorg)

The `app/` tree splits into purpose-named route groups. **Working on core product? Default to ignoring `(transitional)`, `(legacy)`, `(dev)`, `(ssr)`, `(public-demos)` unless the task names them.** When in doubt, work in `(core)` and ask before touching others.

| Group | Purpose | URL | Build |
|---|---|---|---|
| `(core)` | **Production main app.** Slim modern shell, no entity system. New core work goes here. | `/chat`, `/agents`, `/files`, `/notes`… | always |
| `(admin)` | **Production admin.** Super-admin gated at layout level. | `/administration/*` | always |
| `(transitional)` | **On the way in/out.** Being (or to be) replaced by `(core)`; not ready to delete. Lower priority. | `/apps`, `/dashboard`, `/settings`, `/scraper`, `/projects`, `/ai`, `/applets`, `/news`… | always |
| `(legacy)` | **Entity-bound legacy.** Own `EntityProviders` store (full entity system). | `/legacy/*` | always |
| `(ssr)` | **SSR shell.** Own `LiteStoreProvider` + glass shell; demos needing it. | `/demos/ssr/*` | always |
| `(dev)` | **Internal demos / tests / experiments.** Auth-required. | `/demos/*` | `full` only |
| `(public-demos)` | **Public showcase demos.** No auth. | `/demos/public/*` | always |
| `(public)` | Marketing / legal / share / education / canvas. | `/legal`, `/share`, `/p`… | always |
| `(auth-pages)` | Login / signup / etc. | `/login`, `/sign-up`… | always |
| `(popup)` | OAuth popup chrome. | `/popup-window/*` | always |

**"Transitional family"** = `(transitional)` + `(legacy)` — one logical bucket (routes in/out), two groups only because each boots a different Redux store. `(ssr)` is no longer transitional (it serves `/demos/ssr/*`).

**Unified `/demos` index** (`app/(dev)/demos/page.dev.tsx`) auto-discovers every demo across `(dev)`, `(ssr)`, `(public-demos)` + links `(legacy)` demos. Add one by location: auth shell → `(dev)/demos/<cat>/<name>/page.dev.tsx`; SSR+glass → `(ssr)/demos/ssr/<name>/page.tsx`; public → `(public-demos)/demos/public/<name>/page.tsx`; needs entity slice → `(legacy)/legacy/<area>/<name>/page.tsx`.

**Build gate:** `next.config.js` reads `MATRX_PROFILE=core|full` — default **`full` in dev**, **`core` in prod**. In `core`, `(dev)` leaves (renamed `*.dev.tsx`/`*.dev.ts`) and the `/demos/*` redirects are invisible (clean 404, not 307→404); in `full` both compile. Prod (`aimatrx.com`) is `core`; internal demos run on a separate Vercel project with `full`. Preview core locally: `MATRX_PROFILE=core pnpm dev`. `(public-demos)` use plain `*.tsx`, ship everywhere.

**Adding a `(dev)` route:** name leaves `page.dev.tsx` / `layout.dev.tsx` / `loading.dev.tsx` / `route.dev.ts`; helpers (`components/`, `hooks/`, `utils/`) keep plain `.tsx`/`.ts`. Helpers imported by prod code still compile into core ("fake demos" tech debt — relocate to `components/` over time). `/demos/*` redirects live in `next.config.js`.

---

## Redux

- Store: `@/lib/redux/store.ts`. Typed hooks `useAppDispatch` / `useAppSelector` / `useAppStore` from `@/lib/redux/hooks.ts` — never untyped.
- Every selector memoized via `createSelector`. Every property has its own selector.
- Small, individual state updates — no large object replacements.
- If an action or selector doesn't exist, ask before creating one.

---

## Admin Levels

`admins.level`: `developer | senior_admin | super_admin`. New rows default to `super_admin`.

- **Default gate:** `selectIsSuperAdmin` (client) / `requireSuperAdmin` / `checkIsSuperAdmin` (server). Use these unless a surface has been deliberately lowered.
- **Lower deliberately:** read `selectAdminLevel` and compare to the tier you want.
- **Legacy "any admin":** `selectIsAdmin` / `checkIsUserAdmin` — only for the rare all-admin case.
- **State:** `state.userAuth.adminLevel` hydrated once at session boot via the SSR layout chain. Don't refetch.
- `admins` permissions/metadata JSONB columns are NOT in Redux — load on demand.

Do not invent a new admin-gate primitive. `selectIsSuperAdmin` / `requireSuperAdmin` / `is_super_admin()` / `selectAdminLevel` cover every case. Compose, don't duplicate.

---

## Protected Resources

Some tables are super-admin-only and the codebase is hostile territory — any contributor can edit a TS check. Defense is at the DB: RLS deny-writes + `SECURITY DEFINER` RPCs gated by `is_super_admin()` + audit-log trigger. One RPC family per protected resource; one audit log to monitor.

**Currently protected:** `public.admins`, `public.admin_audit_log`.

**Invoke the `protected-resources` skill** before: adding an RLS policy or `SECURITY DEFINER` RPC, touching the admin RPC family (`admin_promote` / `admin_update` / `admin_revoke` / `admin_list` / `admin_list_audit` / `admin_find_user_by_email` / `is_super_admin` / `get_admin_status`), writing `.from('admins')` or `.from('admin_audit_log')`, using `createAdminClient()` for a user-initiated write to a sensitive table, or locking down a new sensitive table.

**Two rules:** one mutation path per protected table (wrap new writes in an RPC); never disable RLS or skip `is_super_admin()` inside the RPC.

---

## Scopes and Context — Canonical Model

Two words, two distinct concepts. Confusing them is what produced the worst code rot in the repo.

- **Scope** = the user-authored dimensions inside an org (`Client`, `Department`, `Repo`, `Case`, `Patient`). Each scope holds context items (the columns) and values (the cells). The only piece of context users actually edit by hand.
- **Context** = everything the LLM receives at invocation time. Assembled by the system from scopes + org + project + task + user + ambient. Users never edit "context" as a thing.

Scope is the most important *part* of context, not its synonym. Read [`features/scopes/FEATURE.md`](./features/scopes/FEATURE.md) before touching any scope/context code.

**Global vs Local context — the load-bearing invariant:**

- **Global context** lives in `lib/redux/slices/appContextSlice.ts` — what the user is working on right now (active org, scope selections, project, task).
- **Local context** lives on the entity being acted on — a note's tags, a task's tags, an agent's tags via `ctx_scope_assignments`.
- **Global context is ONLY written by Surface A components** (`ActiveScopePicker` and friends, under `features/scopes/components/active-context/`). Every other picker — every "tag this with…" UI — writes to `ctx_scope_assignments`, never `appContextSlice`. ESLint enforces this at the import path.
- **Resolution rule:** locally-triggered actions read local-first with global as fallback. Globally-triggered actions read global only. Contradictions (global vs local disagreeing on the same scope type) surface as a warning, never a block.

If a picker is silently changing the sidebar's active context, **it's a bug — even if it "feels helpful."** That pattern is the #1 thing this module exists to kill.

`features/agent-context/` is the thin consumer that fills declared variable and context slots at invocation time. It reads scopes from `features/scopes/`; it does not own scope data. See [`features/agent-context/FEATURE.md`](./features/agent-context/FEATURE.md) for the resolution mechanics.

---

## File Handling — Single Entry Point

Every file flow (`<img>`, AI media blocks, downloads, uploads, share links, mid-stream agent file references, RAG ingest, OG previews) funnels through `@/features/files` / `fileHandler`. Read [`features/files/handler/FEATURE.md`](./features/files/handler/FEATURE.md) before touching any code that loads, displays, uploads, or attaches a file.

1. Use `fileHandler` (`@/features/files/handler/handler`) and `useFileSrc`. Never hand-construct `ImageBlock | AudioBlock | VideoBlock | DocumentBlock`. Never call `Files.uploadFile` from outside the handler.
2. No `supabase.storage` outside `features/files/handler/**` and `features/files/**`. ESLint enforces.
3. Files travel browser ↔ Python directly. No Next.js file routes, no proxy hops.
4. Single internal representation: `NormalizedFile`. Don't fork a second shape.
5. The handler self-resolves user / org / project from Redux. Callsites pass the file only.

New input shape → extend `FileSource` in `features/files/handler/types.ts` and add an adapter. Don't fork the handler.

### Media durability — public/owned media is NEVER a raw signed URL

A signed S3 URL (`?X-Amz-Signature=…&Expires=…`) expires and breaks days later; an anonymous public page can't re-mint it (see [KNOWN_DEFECTS.md](./KNOWN_DEFECTS.md) D1).
- **Render only via `<InlineMediaRef>` (`@/features/files`)** — never a raw `<img>`/`<video>` `src` for our media; it re-mints from `file_id` for authed owners and serves CDN/public URLs. Raw tags can't self-heal.
- **Persist durable refs** (public/CDN URL or `file_id`), never expiring URLs. Got a signed URL from a stream? Recover the `file_id` (`lib/media/durability.ts#fileIdFromUserFilesUrl`) first.
- **A column the public web reads MUST hold a public URL.** Register it with the DB-edge guard (`migrations/mtx_public_media_url_guard.sql`): `insert into mtx_public_url_guard(table_name,column_name)…` + `mtx_public_url_guard_trigger`. Non-durable writes get logged + queued to `mtx_media_heal_queue`.
- **Surface violations loudly** — `reportMediaDurabilityViolation()` (same file) screams when an expiring URL hits a render/store path. That's a defect, not something to silently fix.

## Known defects

Track bugs/gaps you can't fully fix in [KNOWN_DEFECTS.md](./KNOWN_DEFECTS.md) (the frontend twin of aidream's). If a fix is partial, record what's open there — a defect that lives only in a chat log will recur.

---

## Feature Documentation

Every Tier 1/2 feature has a `FEATURE.md` — the single source of truth for that feature. CLAUDE.md is just the index. Template: `features/_FEATURE_TEMPLATE.md`. User-facing `README.md` may coexist.

**Non-negotiable:** after any substantive change, update the matching `FEATURE.md` (status, flows, entry points, invariants) and append to its Change Log (date + one-line summary). Cross-feature changes update every doc affected. Stale docs corrupt every future agent's mental model — treat doc updates with the same weight as code changes in the same PR.

**Editing this file, any `FEATURE.md`, `PRINCIPLES.md`, or a `SKILL.md`?** Invoke the `context-docs` skill first — every doc edit is a full-document review (place it right, merge don't stack, lose no rule, max punch per word).

### Feature entry pages are LIST views, not forced workspaces

`/[feature]` is the user's first stop — a list of everything they can do (create / open / fork), like `/agents` (the gold standard): list → click an item → pick a UI (view / build / run / versions) → back out or jump UIs via the header row. **Never trap the user in a single record's detail UI as if it were the home page** (`/transcripts` shows all my/shared transcripts, recent-first, filters, New button, per-row UI choices — not a forced detail page). If a feature does this today, the fix is the missing list "savior" page demoting the detail page — cheap, high value, not a redesign.

### Per-feature admin map — `/[feature]/admin`

Every Tier 1 feature ships an **admin-gated** (`requireAdmin`, any level) map at `/[feature]/admin` listing every URL, window panel, modal, component, API route, Redux slice, and demo route it owns — utilitarian, never pretty, never failing to connect a resource. Fill a `FeatureAdminMap` config (`features/admin/types/featureAdminMap.ts`) and render `<FeatureAdminPage map={...} />` (`features/admin/components/FeatureAdminPage.tsx`). It exists because features sprawl across `window-panels/windows/`, `components/official-candidate/`, `(dev)/demos/`, sibling folders — without one index, half the surface is invisible.

Design rules (the primitive enforces them): no section descriptions / hero text; full viewport width; every link opens a new tab; rows single-line + compact (`notes?: string[]` for a rare 1-4 bullet expand); window-panel cards get a live "Open" button (`OverlayLaunchButton`); components tiered `official` / `candidate` / `internal` with distinct treatments; `.md` links route through `/admin/docs/<path>` (inline `BasicMarkdownContent`). Auto-surfaces drift — any matching route or panel not declared shows as a yellow warning. **When you add a route / panel / overlay / component, add it to the map config** (`pnpm check:doctrine:staged` + pre-commit flag misses).

### Tier 1 — core features

| Feature | Doc |
|---|---|
| Agents system (umbrella) | `features/agents/FEATURE.md` + `features/agents/docs/` |
| Agent shortcuts | `features/agent-shortcuts/FEATURE.md` |
| Agent apps | `features/agent-apps/FEATURE.md` |
| Agent connections | `features/agent-connections/FEATURE.md` |
| Scopes | `features/scopes/FEATURE.md` |
| Agent context + Brokers | `features/agent-context/FEATURE.md` (narrowed: broker resolution + slot fill; scope CRUD lives in `features/scopes/`) |
| Tool call visualization | `features/tool-call-visualization/FEATURE.md` |
| Streaming system | `features/agents/docs/STREAMING_SYSTEM.md` |
| Artifacts + Canvas | `features/artifacts/FEATURE.md` |
| Chat + Conversation | **Live `/chat` route:** `features/agents/components/chat/FEATURE.md` (the real route, on `features/agents/`). Unified shell (future) + legacy surfaces: `features/conversation/FEATURE.md` |
| Notes | `features/notes/FEATURE.md` |
| Permissions & Sharing | `features/sharing/FEATURE.md` |
| Code editor | `features/code-editor/FEATURE.md` |
| Overlay system (controller, openers, catalogue) | `features/overlays/FEATURE.md` |
| Window Panels (component + window manager) | `features/window-panels/FEATURE.md` |
| Settings system | `features/settings/FEATURE.md` + `.cursor/skills/settings-system/SKILL.md` |
| RAG | `features/rag/FEATURE.md` |
| Universal file handler | `features/files/handler/FEATURE.md` |
| Scheduling | `features/scheduling/FEATURE.md` |
| Podcasts (studio + generation) | `features/podcasts/FEATURE.md` (+ `features/podcasts/docs/`) |
| Transcription (transcripts + studio + scribe + cleanup) | `features/transcripts/FEATURE.md` (**core-storage contract** for every `/transcripts` route) + `features/transcript-studio/FEATURE.md` + `features/transcription-cleanup/FEATURE.md` |
| **PDF domain** (viewer, ops, extraction, analysis, redaction — surfaces: extractor studio, Analysis Studio, demos) | `features/pdf/FEATURE.md` — canonical parts table; **never create a sibling `features/pdf-*`** |
| War Room (session-based multitask command center — tile gallery of task+notes+audio, context-aware) | `features/war-room/FEATURE.md` (consumes tasks/notes/transcription/scopes; gallery engine in `lib/layout/galleryLayout.ts`) |
| Research (web pipeline: search→scrape→analyze→synthesize→document; live "orchestra" + stat-square rail) | `features/research/FEATURE.md` |

### Tier 2 — secondary features

| Feature | Doc |
|---|---|
| API integrations (incl. MCP) | `features/api-integrations/FEATURE.md` |
| Tasks + Projects | `features/tasks/FEATURE.md` |
| Organizations + Invitations | `features/organizations/FEATURE.md` |
| AI Models registry | `features/ai-models/FEATURE.md` |
| Data ingestion (scraper, PDF, transcripts) | `features/scraper/FEATURE.md` |
| Agent feedback API / MCP server | `app/api/mcp/FEATURE.md` |
| Audio pipeline (TTS, audio, podcasts) | `features/audio/FEATURE.md` |
| Image Manager hub | `features/image-manager/FEATURE.md` |
| Custom Dictionary (terminology + pronunciation; user/org/scope-type/scope) | `features/dictionary/FEATURE.md` |

---

## Agent Feedback API

Cross-project issue tracker.

- MCP: `app/api/mcp/[transport]/route.ts` · REST: `app/api/agent/feedback/route.ts`
- Bearer auth against `AGENT_API_KEY` — `lib/services/agent-auth.ts`
- Service layer (admin client, bypasses RLS): `lib/services/agent-feedback.service.ts`

---

## Official Component Library

- Components: `components/official/` · Demos: `app/(admin)/administration/official-components/component-displays/` · Registry: `app/(admin)/administration/official-components/parts/component-list.tsx`
- Must work on import — no local restyling.
- Never delete existing components.

---

## UI / UX Standards

- **Icons:** Lucide only. **No emojis** anywhere a user can see — UI, chips, titles, seed data. Matrx is enterprise.
- **Backgrounds:** `bg-textured` for main backgrounds.
- **Colors:** semantic classes only (`bg-card`, `bg-muted`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `text-primary`, `border-border`). Tokens, elevations (`--elevation-1/2/3`), and gradients (`--gradient-1/2/3`) defined in `app/globals.css`. CSS migration guide: `.cursor/rules/css-updates.mdc`.
- **Loading:** component-library loading states. Never plain "Loading…" text.
- **Layout:** space-efficient, minimal padding/gaps. Page wrapper: `<div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">`.
- **Navigation:** `useTransition` + `startTransition` for all route changes. Loading overlay on the active element. Disable interactive elements during transitions. Guard against duplicate clicks.

### Browser dialogs are banned

`window.confirm` / `window.alert` / `window.prompt` and their bare forms (`confirm(...)` / `alert(...)` / `prompt(...)`) are forbidden anywhere a human can see — including demos, admin, prototypes. Replacements:

- Destructive confirm (inline, with busy state): `<ConfirmDialog />` from `@/components/ui/confirm-dialog`
- Imperative confirm one-liner: `confirm({...})` from `@/components/dialogs/confirm/ConfirmDialogHost`
- Success / error / info: `toast.success` / `toast.error` from `sonner`
- Single-string input: `<TextInputDialog />` from `@/components/dialogs/text-input/TextInputDialog`
- Clipboard fallback: `<ClipboardFallbackDialog />` from `@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog`
- Unsaved-changes guard: `<ConfirmDialog />` driven by `beforeunload` / router blocker

Boy-scout rule: if you encounter a leftover `window.confirm` / `alert` / `prompt` while working in a file, fix it in the same change.

---

## Mobile (Responsive Web)

Single source of truth: `.cursor/skills/ios-mobile-first/SKILL.md`. Rules:

- `h-dvh` / `min-h-dvh` — never `h-screen` or `vh`.
- `pb-safe` on fixed bottom elements.
- `--header-height` (2.5rem) — never hardcode.
- Input `font-size ≥ 16px` (prevents iOS zoom).
- Drawer, not Dialog. Stack sections, not Tabs. Single scroll area per view. Detect with `useIsMobile()`.

---

## Overlays + Windows (two independent systems)

After the May 2026 overhaul (see `docs/OVERLAY_WINDOW_OVERHAUL.md`), what was one conflated system is now two:

1. **Overlay system** — the controller that renders any component (dialog, sheet, modal, window, toast) at the top of the tree on dispatch. Lives in `features/overlays/`. Has explicit JSX prop wiring (no `{...spread}`) so TypeScript catches dispatch/component drift. **Invoke the `overlay-system` skill** before opening / adding / debugging an overlay.
2. **WindowPanel component + Window Manager** — the draggable/resizable frame primitive (`WindowPanel.tsx`), the tray (`WindowTray.tsx`), the runtime registry slice (`windowManagerSlice.ts`), and the persistence machinery. Lives in `features/window-panels/`. A `<WindowPanel>` rendered anywhere joins the runtime manager and participates in minimize-all, focus, persistence — regardless of whether the overlay controller rendered it. **Invoke the `window-panels` skill** for tasks scoped to the component / tray / manager / persistence.

Hard rules: no JSX prop spread in `features/overlays/OverlayController.tsx`; no `kind: "window" | "modal"` discriminator; no callback functions through Redux (use the opener's `onX` props — the callback registry is hidden inside); the overlay catalogue is metadata-only and is NOT iterated to render.

---

## Cross-Repo — matrx-extend

Chrome extension bridge for cross-surface workflows. Real bridge ships in Phase 2.

- Connection map: [docs/MATRX_EXTEND_CONNECTION.md](./docs/MATRX_EXTEND_CONNECTION.md)
- Skill: `connect-matrx-extend`
- Master cross-repo doc (in matrx-extend): `/Users/armanisadeghi/code/matrx-extend/.claude/worktrees/exciting-moser-4b984f/docs/CROSS_REPO_INTEGRATION.md`
- Task pipeline: `.matrx/` (TASKS_FROM_USER → AGENT_TASKS → AGENT_INSTRUCTIONS)

Pre-existing dead references that *look* like extension scaffolding but are not — do not touch in unrelated PRs:

- `features/surfaces/data/surface-candidates.ts:24` — `chrome-extension` in `client_name` union, no surface declared
- `utils/errorContext.ts:10` — defensive stack-frame filter

---

## Available Commands

`.claude/commands/` — run `/<name>` for specialized workflows (e.g. `/web-design`, `/nextjs-patterns`).
