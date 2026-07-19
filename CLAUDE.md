# CLAUDE.md — AI Matrx Admin

Large-scale Next.js no-code AI app builder and admin dashboard. Desktop-first, mobile-responsive.

> **Official Next.js / React / TypeScript best practices:** run `/nextjs-patterns` ([.claude/commands/nextjs-patterns.md](./.claude/commands/nextjs-patterns.md)) — server/client boundaries, shared services, App Router patterns. This file covers project-specific conventions only.

---

## Operating Principle: Build the platform, not the artifact

> **The artifact is disposable. The class of failure goes extinct. Friction is the spec for your next primitive.**

Every task is a probe exposing what the platform is missing. Build (or extend) the generic, named, documented primitive, then complete the task by consuming it. Code that serves only this one artifact is **forbidden** — a second implementation of something we already own is a defect even if it works; delete yours and extend ours. The five anti-patterns this kills (local types, recreated components, parallel Redux slices, duplicated hook logic, the agent-mindset trap): **[PRINCIPLES.md](./PRINCIPLES.md)**. Enforced by ESLint ([`eslint.config.mjs`](./eslint.config.mjs)) and `pnpm check:doctrine` ([script](./scripts/check-doctrine.ts)); every `FEATURE.md` has a Doctrine section ([template](./features/_FEATURE_TEMPLATE.md)). **Nothing runs at commit time** — there is no pre-commit hook and no CI. Every check in this file is advisory and only runs when a human or agent runs it, via `pnpm check:release-gates` ([script](./scripts/run-release-gates.sh)) or by name. **Treat "the guard will catch it" as false; run the check yourself.**

**Before writing ANY new function, component, hook, slice, service, or table, read [docs/reuse-first.md](./docs/reuse-first.md)** — the ladder (**Reuse → Extend → Compose → Create**, exhaust each rung), the mandatory search gate (concept + synonyms + the Primitives Index; "found nothing" names the queries you ran), the importable-code rules (pure core, thin shell, no speculative abstraction), and the new-table bar (exceptional — same entity, new variant → column/flag/JSONB on the existing table). Its Primitives Index is guarded by `pnpm check:reuse-index` — fix or delete a row when a file moves. Your summary states what you searched, what you found, and what you reused or extended.

**This file must never lie.** Every factual claim here — a flag's value, a path, a route group, a version, an enforcement — is one an agent acts on without opening the config. When you change a config setting that this file describes, **change both in the same commit.** `pnpm check:doc-claims` ([script](./scripts/check-doc-claims.ts)) machine-verifies the checkable ones and prints the exact contradiction; add a claim there when you add a load-bearing rule here. A `TEMP:` flip with a promise to revisit is how the React Compiler sat off for three months while this file swore it was on (D62).

---

## Web Access for Testing

- **Form login (canonical — log in once, you're set):** open `/login`, sign in with `admin@admin.com` / `Password1234#`; the session persists for that browser. This is what reliably establishes a full client session for testing.
- Dev auto-login (localhost only, disabled in production): `http://localhost:3000/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/<route>` — `next` defaults to `/dashboard`. If a session exists, it redirects without re-login. (Sets a cookie; the form login above is more reliable for hydrating client data pages.)

---

## Architecture

**Stack:** Next.js 16.2+ (App Router) · React 19.2 · TypeScript 6 (`@typescript/typescript6`; strict, no `any`) · Tailwind 4.3+ (CSS-first, `@theme`) · Turbopack · pnpm 10.29+ · Vercel hosting.
**State minimums here, never exact patches** — `next` / `react` / `typescript` are declared `latest` and drift on every install. `pnpm check:doc-claims` fails on a MAJOR mismatch.
**Mobile:** Expo 54 / RN 0.81 / React 19.1 — iOS 26+ (Liquid Glass), Android 16+ (Material 3 Expressive). LiveKit for AV (requires `expo prebuild`).
**Payments:** Stripe.

Always use the latest stable release of every package — no deprecated APIs.

### Data flow — there is no Next.js middle tier, and Python is not a DB gateway

- **Reads/writes:** React client → Supabase directly (RLS + auth-checked `SECURITY DEFINER` RPCs are the authorization layer). Do NOT route data ops through Next.js API routes or Server Actions.
  - *Exception:* admin-only operations gated by a secret token.
- **Never call the Python backend for work the browser can do directly against Postgres.** Search, metadata reads, counts, listings, soft-delete/rename/restore markers, tag/permission/share-link CRUD — all pure UI↔DB — go **direct via supabase-js** (RLS-filtered table reads, or an `auth.uid()`-checked `SECURITY DEFINER` RPC). Python *exposes* these as REST **only for consumers without Supabase access** (the extension, external clients). Our FE has Supabase, so routing them through Python is pure waste — two extra hops through a slow, agent-saturated server. **A direct call that returns the same rows is always the canonical path.**
- **Compute ("the brain"):** Python backend at `https://server.app.matrxserver.com`. React calls it directly — but ONLY when the request genuinely needs the server: file **bytes** (S3/AWS), URL **signing** (secret), heavy **processing**, or an **auth/anon boundary** the browser can't cross. Never for a plain DB read/write.
- **One canonical path per operation.** If two surfaces reach the same data two ways (one direct, one via Python REST), that's a bug — collapse to the direct path.
- **Next.js API routes never sit between React and Python.** That's an unnecessary network hop. Reserve API routes for true Next.js-only concerns (secret-token admin RPCs, webhooks, OG images, the agent feedback MCP/REST surface).
- **Python microservices** beyond the main backend only when TS hits a real capability wall (heavy PDF/OCR, bulk stats, local NLP at scale, advanced media). Sit them behind the Python backend, never behind Next.js.

### Core invariants

- Server Components by default; Client Components only when interactive.
- **Heavy client code is code-split** with `next/dynamic({ ssr: false })` — never in a Server Component, never stacked down one render path, and only behind a condition (else it's pure cost). Use a `*Impl` + wrapper for anything reused; `next/dynamic` always, never `React.lazy`. **Unexplained build-time bloat is almost always a heavy client component statically imported into a route/server chunk — NOT "big packages"** (one such leak ballooned the build 15→24 min; weeks of creeping bloat trace to this class). Guard each heavy component with an eslint static-import ban (reference: `canonicalMenuStaticImportBan` in `eslint.config.mjs`). **Invoke the `code-splitting` skill** before adding a dynamic import, making a component lazy, hunting build-time bloat, or fixing bundle/hydration issues.
- Dynamic rendering by default. **`'use cache'` is NOT available** — `cacheComponents` is off, so the directive is a build error. Enabling it is a deliberate change that updates this line and `next.config.js` together.
- **React Compiler is on** (`reactCompiler: true`) — no manual `useMemo` / `useCallback` / `React.memo`. Costs ~13% build time (10.6→12.0 min, measured 2026-07-18); that trade is settled. Flipping it off means rewriting this rule in the same change.
- `proxy.ts` (not `middleware.ts`) — auth, route guards, redirects only.
- **State:** Redux RTK for all global state. Extend existing slices; never spin up parallel or local state.
- **Types:** generated types are the source of truth — `types/database.types.ts` (Supabase) + `types/python-generated/api-types.ts` (OpenAPI). Strict, no `any`; never hand-mirror or widen a generated type. Standards: [`TYPESCRIPT_STANDARDS.md`](./TYPESCRIPT_STANDARDS.md). **Fixing a type error or writing Supabase query/RPC code? Invoke the `type-safety` skill first** — silencing an error (cast / suppression / shadow type) is the opposite of fixing it; a real fix changes the code and the data, and an error you can't fix properly gets escalated with a decision brief, never hidden.
- **Realtime:** Supabase Broadcast for ephemeral messaging/presence; Postgres Changes only when RLS-driven authorization is required. **Every `postgres_changes` consumer MUST suppress its own write echoes with a timestamp-monotonic `updated_at` guard** — your echo arrives 50–500ms AFTER your REST response, so a flag-only "saving" check always misses it — and list hydration is ONE batched dispatch, never dispatch-per-row. This is the recurring browser-freeze class (~10 incidents): **invoke the `supabase-realtime` skill** before writing or modifying ANY `.channel(` subscription, echo handling, or autosave↔realtime loop (history: [`features/notes/FEATURE.md`](./features/notes/FEATURE.md) § Freeze-loop doctrine).
- **Errors:** every async op has structured error handling. Never swallow.
- **Loud recovery:** build protective/recovery layers, but every recovery/fixer **screams when it fires** — a recovery firing means a real bug got past the proactive layer.

### Supabase

- **Project:** `txzxabzwovsujtloxrus` (Matrx Main, `us-west-1`, Postgres 17). The only DB this repo talks to. `NEXT_PUBLIC_SUPABASE_URL` → `db.matrxserver.com`. Always pass `project_id: "txzxabzwovsujtloxrus"` to Supabase MCP tools — do not guess between Matrx Main / My Matrx / Matrx Flow / Matrx DM / Matrx Games.
- **Clients:** `@/utils/supabase/client` (browser), `@/utils/supabase/server` (SSR). `createAdminClient()` is restricted — see Protected Resources.
- **Canonical standards:** [docs/official/db-rules.md](docs/official/db-rules.md). Many tables moved from `public` into domain schemas — on any DB error, check the table's live schema first. **Spot a stale table reference or a non-canonical table while working? You own it:** report it and migrate the table + every consumer, client AND server — for code in other repos, write the exact prompt and hand it to the user to relay to that repo's agent.

### Database migrations — the DB is the source of truth, NOT the files

> A `.sql` file in `migrations/` changes **nothing** until applied to Supabase — writing one and reporting "done" is the single most damaging mistake here. A migration is done only when **applied AND verified live AND `pnpm db-types` regenerated.**

App code has **no DDL path** (Supabase JS / PostgREST only); agents apply DDL via the **Supabase MCP** (`apply_migration` / `execute_sql`, project `txzxabzwovsujtloxrus`).
- **Apply + record:** migrations MUST be **idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`). After applying, upsert the shared cross-repo ledger `public._schema_migrations` (key `(source, filename)`; `source='matrx-frontend'`, `checksum` = SHA-256 of file bytes) — it spans aidream / matrx-frontend / matrx-extend (one shared DB). aidream's `python db/apply_migrations.py --source matrx-frontend` batch-applies and records the ledger itself; from here, the MCP one-off + ledger write is the path.
- **Verify (loud):** `pnpm check:migrations` diffs `migrations/*.sql` vs the ledger and screams about anything unapplied or **drifted** (file changed since recorded). Run it yourself — it is part of `pnpm check:release-gates`, not of any commit hook. Then confirm the column/function/trigger exists live via `execute_sql` before reporting done.
- **Regenerate:** `pnpm db-types` → `types/database.types.ts` (or `pnpm sync-types` for DB + Python API types + type-check).
- A migration that must never apply gets `-- migrate: skip: <reason>` in its first 25 lines.

**Schema truth-check — code vs the LIVE DB.** `pnpm check:schema` pulls the live schema (via the `public.schema_truth_snapshot()` RPC → committed `scripts/schema-check/current-schema.json`) and diffs it against the generated types, every direct `.from()/.schema()`, raw `schema.table` strings, and the dead-relations registry — catching moved/retired-table 404s that have no build error. Loud + non-blocking; `pnpm check:dead-relations` is its fast offline subset. **Drift in an autogenerated file (`database.types.ts`, `types/python-generated/*`, `dead-relations.json`) means edit the SOURCE and regenerate — the report says which command.** Read [`scripts/schema-check/FEATURE.md`](./scripts/schema-check/FEATURE.md) before adding a check or touching the guard.

**Typecheck with `pnpm type-check` — never a hand-rolled `tsc -p tsconfig.json`.** Next build output (`.next` + every `NEXT_DISTDIR` variant a parallel agent's dev server creates: `.next-preview`, …) stays excluded from tsc AND eslint via the `.next*` glob — `next dev` *appends* its distDir types to `tsconfig.json`'s `include` on boot, and one truncated machine-written validator (dev server killed mid-write) makes `tsc` report 3 syntax errors and **nothing else**, hiding every real type error while looking green. `pnpm check:tsconfig` guards the exclude; `pnpm clean:next` removes stale alternate build dirs.

**`pnpm type-check` is the ONLY type gate — the build does not check types.** `next.config.js` sets `typescript.ignoreBuildErrors: true`, so a red type error still deploys. Run `pnpm type-check` before you report a task done; never assume a green build means green types. Excluding a path from `tsconfig.typecheck.json` to make it pass is banned — that is how 485 shipped files sat outside the gate for three weeks (D63).

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

The `app/` tree splits into purpose-named route groups. **Working on core product? Default to ignoring `(transitional)` and `(dev)` unless the task names them.** When in doubt, work in `(core)` and ask before touching others.

| Group | Purpose | URL | Build |
|---|---|---|---|
| `(core)` | **Production main app.** Slim modern shell, no entity system. New core work goes here. | `/chat`, `/agents`, `/files`, `/notes`… | always |
| `(admin)` | **Production admin.** Super-admin gated at layout level. | `/administration/*` | always |
| `(transitional)` | **On the way in/out.** Being (or to be) replaced by `(core)`; not ready to delete. Lower priority. | `/apps`, `/dashboard`, `/settings`, `/scraper`, `/projects`, `/ai`, `/applets`, `/news`… | always |
| `(dev)` | **Internal demos / tests / experiments.** Auth-required. | `/demos/*` | `full` only |
| `(public)` | Marketing / legal / share / education / canvas. | `/legal`, `/share`, `/p`… | always |
| `(auth-pages)` | Login / signup / etc. | `/login`, `/sign-up`… | always |
| `(popup)` | OAuth popup chrome. | `/popup-window/*` | always |

**`(legacy)` and `(public-demos)` are DELETED** (entity system removed; public demos relocated). Never create files there. `pnpm check:doc-claims` fails if this table and `app/` disagree.

**Shell:** `(core)` and `(admin)` both render `AppShell` (`features/shell/components/AppShell.tsx`): sidebar + transparent header + `#shell-header-center`. **`(core)` routes:** route chrome via `<PageHeader>`, body `h-full overflow-hidden` — see [`features/shell/components/header/variants/USAGE.md`](./features/shell/components/header/variants/USAGE.md); **fixing or building any `(core)` route header/body → invoke the `core-route-headers` skill** (classification, exemplars, mobile bottom-sheet rules, browser verification). **Admin exception:** content sits below the header (not behind it) via scoped `styles/shell.css` rules — admin pages may use `h-[calc(100dvh-2.5rem)]`. `(transitional)` still uses `ResponsiveLayout`.

**Build gate:** `next.config.js` reads `MATRX_PROFILE=core|full` — default **`full` in dev**, **`core` in prod** (`aimatrx.com`; internal demos run on a separate Vercel project with `full`). In `core`, `(dev)` leaves and the `/demos/*` redirects (defined in `next.config.js`) are invisible (clean 404, not 307→404); in `full` both compile. Preview locally: `MATRX_PROFILE=core pnpm dev`.

**Demos:** the `/demos` index (`app/(dev)/demos/page.dev.tsx`) auto-discovers demos under `(dev)/demos/`. Every new demo goes to `(dev)/demos/<name>/page.dev.tsx`. `(dev)` route leaves are named `page.dev.tsx` / `layout.dev.tsx` / `loading.dev.tsx` / `route.dev.ts`; helpers (`components/`, `hooks/`, `utils/`) keep plain `.tsx`/`.ts` — helpers imported by prod code still compile into core ("fake demos" tech debt; relocate to `components/` over time).

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

**Currently protected:** `admin.admins`, `admin.admin_audit_log` (schema `admin`, not `public`).

**Invoke the `protected-resources` skill** before: adding an RLS policy or `SECURITY DEFINER` RPC, touching the admin RPC family (`admin_promote` / `admin_update` / `admin_revoke` / `admin_list` / `admin_list_audit` / `admin_find_user_by_email` / `is_super_admin` / `get_admin_status`), writing `.schema('admin').from('admins')` or `.from('admin_audit_log')`, using `createAdminClient()` for a user-initiated write to a sensitive table, or locking down a new sensitive table.

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

**A user's own file URL never "expires": on any signed-URL detection (via `isSignedUrl` from `@/lib/media/signed-url`, which knows both AWS dialects) or media load failure, re-mint from its `file_id` — never treat a signed URL as permanent and never let "expired" surface as an error.**

A signed S3 URL (`?X-Amz-Signature=…&Expires=…`) expires and breaks days later; an anonymous public page can't re-mint it (see [FOUND_DEFECTS.md](./FOUND_DEFECTS.md) D1).
- **Render only via `<InlineMediaRef>` (`@/features/files`)** — never a raw `<img>`/`<video>` `src` for our media; it re-mints from `file_id` for authed owners and serves CDN/public URLs. Raw tags can't self-heal.
- **Persist durable refs** (public/CDN URL or `file_id`), never expiring URLs. Got a signed URL from a stream? Recover the `file_id` (`lib/media/durability.ts#fileIdFromUserFilesUrl`) first.
- **A column the public web reads MUST hold a public URL.** Register it with the DB-edge guard (`migrations/mtx_public_media_url_guard.sql`): `insert into mtx_public_url_guard(table_name,column_name)…` + `mtx_public_url_guard_trigger`. Non-durable writes get logged + queued to `mtx_media_heal_queue`.
- **Surface violations loudly** — `reportMediaDurabilityViolation()` (same file) screams when an expiring URL hits a render/store path. That's a defect, not something to silently fix.

## Found defects & task tracking

Track bugs/gaps you can't fully fix in [FOUND_DEFECTS.md](./FOUND_DEFECTS.md) (the frontend twin of aidream's). If a fix is partial, record what's open there — a defect that lives only in a chat log will recur. Four-file task system: `FOUND_DEFECTS.md` (unapproved discoveries), `CURRENT_ERRORS.md` (error-dump inbox), `.matrx/AGENT_TASKS.md` (the only approved worklist), `.matrx/ARMAN_TASKS.md` (Arman-only asks). **Invoke the `task-hygiene` skill** to triage, promote, or clean any of them.

## Handoffs

`docs/handoffs/` holds forward-looking work orders (shared system with aidream — one doc per piece of work). **Invoke the `handoffs` skill** before writing one, taking one over, or ending any turn that progressed work a handoff covers — completed tasks collapse to one bullet, finished handoffs get deleted. Rot backstop: `/handoff-cleanup`.

---

## Feature Documentation

Every Tier 1/2 feature has a `FEATURE.md` — the single source of truth for that feature. CLAUDE.md is just the index. Template: `features/_FEATURE_TEMPLATE.md`. User-facing `README.md` may coexist.

**Non-negotiable:** after any substantive change, update the matching `FEATURE.md` (status, flows, entry points, invariants) and append to its Change Log (date + one-line summary). Cross-feature changes update every doc affected. Stale docs corrupt every future agent's mental model — treat doc updates with the same weight as code changes in the same PR.

**Editing this file, any `FEATURE.md`, `PRINCIPLES.md`, or a `SKILL.md`?** Invoke the `context-docs` skill first — every doc edit is a full-document review (place it right, merge don't stack, lose no rule, max punch per word).

**Cross-repo truth lives in `/Users/armanisadeghi/code/common-docs/` (its own repo) — ONE doc, pointer lines in each touched repo, NEVER a per-repo copy.** Documenting anything that spans repos (e.g. `common-docs/cms-system/FEATURE.md` for the CMS platform)? **Invoke the `cross-repo-docs` skill.**

### Feature entry pages are LIST views, not forced workspaces

`/[feature]` is the user's first stop — a list of everything they can do (create / open / fork), like `/agents` (the gold standard): list → click an item → pick a UI (view / build / run / versions) → back out or jump UIs via the header row. **Never trap the user in a single record's detail UI as if it were the home page** (`/transcripts` shows all my/shared transcripts, recent-first, filters, New button, per-row UI choices — not a forced detail page). If a feature does this today, the fix is the missing list "savior" page demoting the detail page — cheap, high value, not a redesign.

### Per-feature admin map — `/[feature]/admin`

Every Tier 1 feature ships an **admin-gated** (`requireAdmin`, any level) map at `/[feature]/admin` listing every URL, window panel, modal, component, API route, Redux slice, and demo route it owns — utilitarian, never pretty, never failing to connect a resource. Fill a `FeatureAdminMap` config (`features/admin/types/featureAdminMap.ts`) and render `<FeatureAdminPage map={...} />` (`features/admin/components/FeatureAdminPage.tsx`). It exists because features sprawl across `window-panels/windows/`, `components/official-candidate/`, `(dev)/demos/`, sibling folders — without one index, half the surface is invisible.

Design rules (the primitive enforces them): no section descriptions / hero text; full viewport width; every link opens a new tab; rows single-line + compact (`notes?: string[]` for a rare 1-4 bullet expand); window-panel cards get a live "Open" button (`OverlayLaunchButton`); components tiered `official` / `candidate` / `internal` with distinct treatments; `.md` links route through `/admin/docs/<path>` (inline `BasicMarkdownContent`). Auto-surfaces drift — any matching route or panel not declared shows as a yellow warning. **When you add a route / panel / overlay / component, add it to the map config** — run `pnpm check:doctrine` yourself to flag misses; nothing runs it for you.

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
| **Content-IR / Shape System** — canonical structured-content platform (`__kind` kinds, streaming JSON→IR envelopes, kind registry + `kind_surface`/`kind_component`/`kind_example`, render routing; workflow node I/O speaks kinds). **Read BEFORE touching stream/DB block parsing, `__kind`, `metadata.__ir`, or any kind asset** | `features/content-ir/FEATURE.md` → `features/content-ir/docs/SHAPE_SYSTEM.md` |
| Artifacts + Canvas | `features/artifacts/FEATURE.md` |
| Chat + Conversation | **Live `/chat` route:** `features/agents/components/chat/FEATURE.md` (the real route, on `features/agents/`). Unified shell (future) + legacy surfaces: `features/conversation/FEATURE.md` |
| Notes | `features/notes/FEATURE.md` |
| Permissions & Sharing | `features/sharing/FEATURE.md` |
| Code editor | `features/code-editor/FEATURE.md` |
| Overlay system (controller, openers, catalogue) | `features/overlays/FEATURE.md` |
| Window Panels (component + window manager) | `features/window-panels/FEATURE.md` |
| Settings system | `features/settings/FEATURE.md` + `.claude/skills/settings-system/SKILL.md` |
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
| Dashboard (`/dashboard` hub + favorites/pinning primitive) | `features/dashboard/FEATURE.md` |
| API integrations (incl. MCP) | `features/api-integrations/FEATURE.md` |
| Tasks + Projects | `features/tasks/FEATURE.md` |
| Organizations + Invitations | `features/organizations/FEATURE.md` |
| AI Models registry | `features/ai-models/FEATURE.md` |
| Data ingestion (scraper, PDF, transcripts) | `features/scraper/FEATURE.md` |
| Agent feedback API / MCP server | `app/api/mcp/FEATURE.md` |
| Audio pipeline (TTS, audio, podcasts) | `features/audio/FEATURE.md` |
| Image Manager hub | `features/image-manager/FEATURE.md` |
| Custom Dictionary (terminology + pronunciation; user/org/scope-type/scope) | `features/dictionary/FEATURE.md` |
| CMS (client sites + standalone HTML pages, separate Supabase project `viyklljfdhtidwecakwx`; agent-activity visibility surface at `/administration/cms-agents`) | `features/cms/FEATURE.md` |

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
- **Layout:** space-efficient, minimal padding/gaps. **`(core)` AppShell routes:** route chrome in `<PageHeader>`, body wrapper `h-full overflow-hidden` — **never** `h-page` or `calc(100dvh - header)` (`.shell-main` is already full viewport). See [`features/shell/components/header/variants/USAGE.md`](./features/shell/components/header/variants/USAGE.md).
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

Single source of truth: `.claude/skills/ios-mobile-first/SKILL.md`. Rules:

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

**Killing a panel/overlay for good?** **Invoke the `remove-window-panel` skill** — the reverse-operation checklist for deleting an overlay across all ~10 registration sites and leaving no shim, fallback, or dead name behind.

---

## Cross-Repo — Token Broker (scoped short-lived credentials)

**A client needing temporary privileged reach (provider realtime sessions, direct provider calls) mints a brokered credential from aidream `POST /api/broker/tokens` — NEVER holds a long-lived provider key.** The client primitive lives at `lib/api/broker/` (typed envelope, mint client, refresh-ahead cache, mode dispatch, hooks) — **invoke the `token-broker-client` skill** before wiring any provider connection from client code. Contract: [`lib/api/broker/FEATURE.md`](./lib/api/broker/FEATURE.md); cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/token-broker/FEATURE.md`. Test harness: `/demos/token-broker`.

## Cross-Repo — App Config (remote runtime configuration for desktop clients)

Shipped desktop apps read non-secret runtime values (server URLs, flags, min versions) from one anon-readable Supabase `app_config` row per app. This repo's role: the admin UI at `/administration/app-config` (editor with diff-confirmed save, history/restore — writes ONLY via the `admin_update_app_config` RPC; code in `features/admin/app-config/`). **Live since 2026-07-14.** Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/app-config/FEATURE.md` — read it before touching this feature in ANY repo.

## Cross-Repo — Access Architecture (permissions, sharing, memberships, associations)

How a row becomes visible platform-wide — ownership, `iam.permissions`, `iam.memberships`, `platform.associations` conveyance, `visibility`, admin level — spans this repo, aidream, and the shared DB. Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/access-architecture/FEATURE.md` — read it before touching any permission/sharing/scope-access code.

---

## Cross-Repo — matrx-extend

Chrome extension bridge for cross-surface workflows. Real bridge ships in Phase 2.

- Connection map: [docs/MATRX_EXTEND_CONNECTION.md](./docs/MATRX_EXTEND_CONNECTION.md)
- Skill: `connect-matrx-extend`
- Master cross-repo doc (in matrx-extend): `/Users/armanisadeghi/code/matrx-extend/docs/CROSS_REPO_INTEGRATION.md`
- Task pipeline: `.matrx/` (TASKS_FROM_USER → AGENT_TASKS → AGENT_INSTRUCTIONS)

Pre-existing dead references that *look* like extension scaffolding but are not — do not touch in unrelated PRs:

- `features/surfaces/data/surface-candidates.ts:24` — `chrome-extension` in `client_name` union, no surface declared
- `utils/errorContext.ts:10` — defensive stack-frame filter

---

## Available Commands

`.claude/commands/` — run `/<name>` for specialized workflows (e.g. `/web-design`, `/nextjs-patterns`).
