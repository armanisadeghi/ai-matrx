# CLAUDE.md — AI Matrx Admin

Large-scale Next.js no-code AI app builder and admin dashboard. Desktop-first, mobile-responsive.

> **Official Next.js / React / TypeScript best practices:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md` — single source of truth for rendering, caching, performance, mobile, Tailwind, component contracts, API patterns. This file covers project-specific conventions only.

---

## Operating Principle: Build the platform, not the artifact.

> **The artifact is disposable. The class of failure goes extinct.**

Every task — feature, bug, or refactor — is a probe that exposes what the platform is missing. Your real job is to build (or extend) the missing capability and complete the task by consuming it. **Friction is the spec for your next primitive.**

- **Forbidden:** code that only serves this one artifact and could not be reused.
- **Required:** generic, named, documented platform primitives.

**Three acceptance tests:**
- *Feature:* "If I deleted what I just built, could I rebuild it in minutes using only existing platform capabilities?"
- *Bug:* "Is this entire class of failure now structurally impossible — not just patched here?"
- *Any change that adds a type / component / slice / hook:* "Did I prove (grep, file read, or `Explore` subagent) that no existing primitive could be extended instead?"

If yes — done. If no — the remainder is your next infrastructure ticket. Extract it.

The five frontend anti-patterns that violate this doctrine — local types, recreated components, parallel Redux slices, duplicated hook logic, the agent-mindset trap — each with concrete "look here first" anchors and a search algorithm scaled by feature size, are catalogued in **[PRINCIPLES.md](./PRINCIPLES.md)**. Read it once, internalize it, return when you hit friction.

Enforcement: ESLint rules in [`eslint.config.mjs`](./eslint.config.mjs), the `pnpm check:doctrine` script ([`scripts/check-doctrine.ts`](./scripts/check-doctrine.ts)), and the pre-commit hook configured in `package.json`. Every `FEATURE.md` includes a Doctrine compliance section ([template](./features/_FEATURE_TEMPLATE.md)).

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

### Supabase

- **Project:** `txzxabzwovsujtloxrus` (Matrx Main, `us-west-1`, Postgres 17). The only DB this repo talks to. `NEXT_PUBLIC_SUPABASE_URL` → `db.matrxserver.com`. Always pass `project_id: "txzxabzwovsujtloxrus"` to Supabase MCP tools — do not guess between Matrx Main / My Matrx / Matrx Flow / Matrx DM / Matrx Games.
- **Clients:** `@/utils/supabase/client` (browser), `@/utils/supabase/server` (SSR). `createAdminClient()` is restricted — see Protected Resources.

---

## File Organization

- General: `/components`, `/hooks`, `/utils`, `/constants`, `/types`, `/providers`.
- Features: `/features/[name]/` with `types.ts`, `components/`, `hooks/`, `service.ts`, `utils.ts`, `constants.ts`, `state/` (or `redux/`).
- Route → feature: `app/(core)/notes/page.tsx` → `features/notes/`.
- Never write to project root. One `README.md` per feature, only after the code is tested.
- **Barrel files (`index.ts` re-exports) are being eliminated.** Don't create new ones. Import from source. ESLint enforces. Replace existing barrels opportunistically when editing a file.

**Do not invent new top-level features.** A feature is a big, distinct piece of app functionality, usually with multiple routes. Introducing one is the user's call, not yours. Default to extending an existing feature; if a new feature seems genuinely warranted, ask first.

### Route groups — the four buckets (2026-05-26 reorganization)

The `app/` tree is split into clearly-purposed route groups. **Agents working on the core product should default to ignoring `(transitional)`, `(legacy)`, `(dev)`, `(ssr)`, and `(public-demos)` unless the task explicitly involves them.** When in doubt, work in `(core)` and ask before touching the others.

| Group | Purpose | URL prefix | Build profile |
|---|---|---|---|
| `app/(core)/` | **Production main app.** Slim modern shell, no entity system. Where new core work goes. | various (`/chat`, `/agents`, `/files`, `/notes`, etc.) | always |
| `app/(admin)/` | **Production admin.** Super-admin gated at the layout level. | `/administration/*` | always |
| `app/(transitional)/` | **On the way in or on the way out.** Routes that have been (or will be) replaced by surfaces in `(core)` but aren't ready to delete. Ships in production, lower priority for new work. | `/apps`, `/dashboard`, `/settings`, `/flash-cards`, `/prompt-apps`, `/news`, `/scraper`, `/projects`, `/applets`, `/ai`, `/admin` (old), `/agent-lists`, `/registered-results`, `/local`, `/flashcard` | always |
| `app/(legacy)/` | **Entity-bound legacy.** Top-level group with its own `EntityProviders` store (full entity system). Sibling of `(transitional)`. | `/legacy/*` | always |
| `app/(ssr)/` | **SSR shell experiment.** Top-level group with its own `LiteStoreProvider` + glass shell. Holds demos that need the lite-store shell. | `/demos/ssr/*` | always |
| `app/(dev)/` | **All internal demos / tests / experimental surfaces.** Auth-required. Consolidated under one URL prefix. Excluded from the prod-core build in Phase 2 via `MATRX_PROFILE`. | `/demos/*` (everything: tests, general, settings-*, layout-tests, dynamic-imports, lists-junk, lists-explorer, preview, google-auth) | `full` only (Phase 2) |
| `app/(public-demos)/` | **Public showcase demos.** Same `/demos/*` URL space as `(dev)`, but no auth. Routes that used to live at `(public)/demos/*`. | `/demos/public/*` | always |
| `app/(public)/` | Production marketing / legal / share / education / canvas. | various (`/legal`, `/share`, `/p`, `/education`, etc.) | always |
| `app/(auth-pages)/` | Login / signup / forgot-password / etc. | `/login`, `/sign-up`, etc. | always |
| `app/(popup)/` | OAuth popup chrome. | `/popup-window/*` | always |

**The "transitional family"** is `(transitional)` + `(legacy)`. Conceptually one bucket (routes on their way in or out); two groups only because each boots a different Redux store. Agents can treat them as one logical area when scoping work. `(ssr)` is no longer transitional — its routes now exclusively serve demos under `/demos/ssr/*`.

**The unified `/demos` index:** there is one landing page at `/demos` (`app/(dev)/demos/page.dev.tsx`) that auto-discovers and lists every demo/test/experimental route across all three demo groups — `(dev)`, `(ssr)`, `(public-demos)` — plus links to the entity-bound demos under `(legacy)`. Adding a new demo anywhere under those trees automatically shows up on the landing. To add a demo:
- Standard auth shell (default) → `app/(dev)/demos/<category>/<name>/page.dev.tsx`
- Needs SSR + glass shell → `app/(ssr)/demos/ssr/<name>/page.tsx`
- Public (no auth) → `app/(public-demos)/demos/public/<name>/page.tsx`
- Needs entity slice → `app/(legacy)/legacy/<area>/<name>/page.tsx`

**Build gate (active):** `next.config.js` reads `MATRX_PROFILE=core|full`. Default is **`full` in development** (so `/demos/*` works locally without per-developer env setup) and **`core` in production**. When `core`, `pageExtensions = ['tsx', 'ts', 'jsx', 'js']` and the 172 route leaves under `(dev)/` — renamed `*.dev.tsx` / `*.dev.ts` — are invisible to the build. When `full`, `pageExtensions` also matches `dev.tsx` / `dev.ts` so the same repo compiles every route. The redirects pointing at `(dev)`-only URLs (`/tests/*`, `/demo/*`, `/settings-*-demo`, etc.) are also gated on `full` so the core build returns a clean 404 instead of 307→404. Production deploys to `aimatrx.com` (default `core`); the internal demos run on a separate Vercel project with `MATRX_PROFILE=full`. To preview the production-core build locally, run `MATRX_PROFILE=core pnpm dev`. Public demos under `(public-demos)` use plain `*.tsx` and ship in every build.

**Adding a new route under `(dev)/`:** name route leaves `page.dev.tsx`, `layout.dev.tsx`, `loading.dev.tsx`, `route.dev.ts`. Helper components (`components/`, `hooks/`, `utils/`) keep plain `.tsx` / `.ts`. Test the URL works locally (Next dev uses both extensions). Helper components imported by production code still compile into the core build — those are tracked as "fake demos" tech debt; relocate to `components/` over time.

**URL redirects** for the `/demos/*` consolidation are in `next.config.js` (`/tests/* → /demos/tests/*`, `/demo/* → /demos/general/*`, `/settings-*-demo → /demos/settings-*`, etc.) so existing bookmarks and external links continue to resolve.

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

---

## Feature Documentation

Every Tier 1/2 feature has a `FEATURE.md` — the single source of truth for that feature. CLAUDE.md is just the index. Template: `features/_FEATURE_TEMPLATE.md`. User-facing `README.md` may coexist.

**Non-negotiable:** after any substantive change, update the matching `FEATURE.md` (status, flows, entry points, invariants) and append to its Change Log (date + one-line summary). Cross-feature changes update every doc affected. Stale docs corrupt every future agent's mental model — treat doc updates with the same weight as code changes in the same PR.

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

### Tier 2 — secondary features

| Feature | Doc |
|---|---|
| API integrations (incl. MCP) | `features/api-integrations/FEATURE.md` |
| Tasks + Projects | `features/tasks/FEATURE.md` |
| Organizations + Invitations | `features/organizations/FEATURE.md` |
| AI Models registry | `features/ai-models/FEATURE.md` |
| Data ingestion (scraper, PDF, research, transcripts) | `features/scraper/FEATURE.md` |
| Agent feedback API / MCP server | `app/api/mcp/FEATURE.md` |
| Audio pipeline (TTS, audio, podcasts) | `features/audio/FEATURE.md` |
| Image Manager hub | `features/image-manager/FEATURE.md` |

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
