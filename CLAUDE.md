# CLAUDE.md — AI Matrx Admin

Large-scale Next.js no-code AI app builder and admin dashboard. Desktop-first, mobile-responsive.

> **Official Next.js / React / TypeScript best practices:** run `/nextjs-patterns` ([.claude/commands/nextjs-patterns.md](./.claude/commands/nextjs-patterns.md)) — server/client boundaries, shared services, App Router patterns. This file covers project-specific conventions only.

---

## Operating Principle: Build the platform, not the artifact

> **The artifact is disposable. The class of failure goes extinct. Friction is the spec for your next primitive.**

Every task is a probe exposing what the platform is missing. Build (or extend) the generic, named, documented primitive, then complete the task by consuming it. Code that serves only this one artifact is **forbidden** — a second implementation of something we already own is a defect even if it works; delete yours and extend ours. The five anti-patterns this kills (local types, recreated components, parallel Redux slices, duplicated hook logic, the agent-mindset trap): **[PRINCIPLES.md](./PRINCIPLES.md)**. Enforced by ESLint ([`eslint.config.mjs`](./eslint.config.mjs)) and `pnpm check:doctrine` ([script](./scripts/check-doctrine.ts)); every `FEATURE.md` has a Doctrine section ([template](./features/_FEATURE_TEMPLATE.md)). **Nothing runs at commit time** — there is no pre-commit hook and no CI. Every check in this file is advisory and only runs when a human or agent runs it, via `pnpm check:release-gates` ([script](./scripts/run-release-gates.sh)) or by name. **Treat "the guard will catch it" as false; run the check yourself.**

**Before writing ANY new function, component, hook, slice, service, or table, read [docs/reuse-first.md](./docs/reuse-first.md)** — the ladder (**Reuse → Extend → Compose → Create**, exhaust each rung), the mandatory search gate (concept + synonyms + the Primitives Index; "found nothing" names the queries you ran), the importable-code rules (pure core, thin shell, no speculative abstraction), and the new-table bar (exceptional — same entity, new variant → column/flag/JSONB on the existing table). Its Primitives Index is guarded by `pnpm check:reuse-index` — fix or delete a row when a file moves. Your summary states what you searched, what you found, and what you reused or extended.

## The user — a brilliant, absolutely NON-technical Subject Matter Expert

**Our core user is world-best at something (a doctor, lawyer, researcher, SEO expert, opera singer) and here to turn that knowledge into AI-integrated systems — and they do not code, do not prompt-engineer, do not know AI, and never will.** A surface that needs technical intuition is broken for our user regardless of its power: zero jargon, zero developer concepts, a UX that just flows. **THE MISMATCH RULE:** never assume the person inside a topic UI is an expert in that topic — the SEO expert is most likely here building their own SEO systems; the opera singer may be the one inside our SEO tools. Build **topic surfaces** for a smart novice (the system supplies the expert reflexes, per the Canvas Doctrine); build **builder surfaces** (workflows, agents, scopes, apps) for a genius in something else who is a total novice at building. Canonical (Arman's words, 2026-08-08): `/Users/armanisadeghi/code/common-docs/systems/ai-dream-platform/USER.md`.

## 🚨 NO DEAD ENDS — every identity is a door, every capability is on the table

> **THE DOOR LAW.** If the UI names a thing that has an identity in our system, the UI must let the user reach it.
> **THE INVENTORY LAW.** You may not build a surface before you know what the platform already gives it.

Doctrine (cross-repo, canonical): **`/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md`**. Concrete FE recipe + the primitives to reach for: **invoke the `no-dead-ends` skill** before building or fixing any surface that displays a record. There is **no size threshold** — admin consoles, demos, dialogs, and toasts are all in scope.

Four doors, offered in this order: **Open** (click the name — always), **New tab** (always, when navigating would cost the user their current state), **Peek** (non-blocking preview — whenever the next question is "which one is that?"), **Window** (a `WindowPanel` beside the work, not instead of it). Plus the corollaries that cause the real damage: **a relationship you can resolve must be rendered AND linked** (knowing an agent's system twin exists and only saying "this isn't a system agent" is worse than saying nothing); **a problem you can detect ships with its one-click fix**; **a comparison states the verdict, not a timestamp** (identical / what differs / link to the diff); **never render an id you can't open**; **a count is a door** (`3 overrides` reaches those overrides).

The Inventory Law is reuse-first's other half: don't build a *poorer* one. Before the first line, inventory what exists for every entity the surface names — registry route (`getEntityInfo(token).hrefFor`), peek (`features/organizations/peek/registry.ts`), overlay opener, window panel, action registry (e.g. `features/agents/browse/agentActionRegistry.tsx`), canonical list shell. Missing a primitive? Build the generic one where every surface can reach it, then consume it — the task is the probe, the primitive is the deliverable.

**Enforced, because documentation alone was not enough.** `pnpm check:dead-ends` ([`scripts/dead-ends/FEATURE.md`](./scripts/dead-ends/FEATURE.md)) statically finds surfaces that name a record without a door — loud, **never blocking** (advisory in `run-release-gates.sh` in both modes). The **scoreboard is `/administration/reporting/dead-ends`**: ranked by feature and file, every row opens its source line (and its route when the finding sits on a route file — most findings are in components), and every row hands you a paste-ready repair brief. Refresh it with `pnpm check:dead-ends:write` and commit the snapshot. Narrow ESLint backstop: `matrx/no-bare-id-text` (warn). Campaign worklists: [`docs/handoffs/no-dead-ends-sweep.md`](./docs/handoffs/no-dead-ends-sweep.md) + [`docs/handoffs/inventory-law-sweep.md`](./docs/handoffs/inventory-law-sweep.md). A clean report is not proof — read that FEATURE.md's *Known limits* before claiming a surface is done.

**This file must never lie.** Every factual claim here — a flag's value, a path, a route group, a version, an enforcement — is one an agent acts on without opening the config. When you change a config setting that this file describes, **change both in the same commit.** `pnpm check:doc-claims` ([script](./scripts/check-doc-claims.ts)) machine-verifies the checkable ones and prints the exact contradiction; add a claim there when you add a load-bearing rule here. A `TEMP:` flip with a promise to revisit is how the React Compiler sat off for three months while this file swore it was on (D62).

---

## Web Access for Testing

**Read [docs/official/browser-testing.md](./docs/official/browser-testing.md) before driving a browser or starting a dev server** — the verified harness mechanics (viewport, refs, form fill, mobile emulation) that otherwise cost you a turn to rediscover. Two laws, non-negotiable:

- 🚨 **ONE dev server, machine-wide** — shared by you, Arman, and Codex. This box has 16GB; a second Next dev server is a reliable hard crash. Start it ONLY via `preview_start` `name: "next-dev"` (port 3001); **never `pnpm dev` in Bash** (unmanaged, unreaped, leaks until the box dies). One already running? Reuse its port. Enforced by a PreToolUse hook on both `preview_start` and Bash — install/update it on any machine with `pnpm setup:agent-harness` ([`scripts/agent-harness/`](./scripts/agent-harness/); machine setup SoR: `/Users/armanisadeghi/code/common-docs/systems/agent-machine-setup/FEATURE.md`).
- **ONE browser: the in-app Browser pane (`mcp__Claude_Browser__*`). Never `mcp__claude-in-chrome__*`** — Chrome is Codex's surface and drives Arman's real profile. The pane has its own persistent profile, so a login sticks.

- **Form login (canonical — log in once, you're set):** open `/login`, sign in with `admin@admin.com` / `Password1234#`; the session persists for that browser. This is what reliably establishes a full client session for testing.
- Dev auto-login (localhost only, disabled in production): `http://localhost:<port>/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/<route>` — `next` defaults to `/dashboard`. If a session exists, it redirects without re-login. (Sets a cookie; the form login above is more reliable for hydrating client data pages.)

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
- **Optimistic concurrency on direct writes:** a read-modify-write of a record the user edited compare-and-swaps on the canonical `version` column via [`utils/supabase/guardedUpdate.ts`](./utils/supabase/guardedUpdate.ts) (`.eq("version", expectedVersion)` + typed saved/conflict/not_found result) — never hand-roll another variant, never compare `updated_at` in new code. Opt-in per write; unguarded writes stay last-write-wins. Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/optimistic-concurrency/FEATURE.md` — read it before touching this feature in ANY repo.
- **Next.js API routes never sit between React and Python.** That's an unnecessary network hop. Reserve API routes for true Next.js-only concerns (secret-token admin RPCs, webhooks, OG images, the agent feedback MCP/REST surface).
- **Python microservices** beyond the main backend only when TS hits a real capability wall (heavy PDF/OCR, bulk stats, local NLP at scale, advanced media). Sit them behind the Python backend, never behind Next.js.

### Core invariants

- Server Components by default; Client Components only when interactive.
- **Heavy client code is ONE piece behind ONE `next/dynamic({ ssr: false })` edge — THE FRAGMENTATION LAW.** Build memory/time scale with **split-point count × contexts reaching each one**; every `next/dynamic` is a formally-planned chunk group, so a registry/map/sibling-set of many dynamics is a defect unless items open one-at-a-time on user action (`lazyOverlay`). A surface consolidates statically into a `*Impl`/core with one front-door dynamic (exemplars: `MarkdownStream`, `DeferredSingletonWrapper`); inside such a gate, default to static imports, and a genuinely heavy engine (monaco/mermaid/reactflow class) keeps a boundary as **`React.lazy`** (the build-cheap form in-gate). **Never mass-convert `React.lazy` → `next/dynamic`** — that exact move added ~190 chunk groups and OOM-killed 14 straight production builds on 2026-07-27 (fully reverted; consolidating the same surfaces instead made the build 33% FASTER: 12m → 8m preview, 21m50s → 9m production). Never `dynamic({ssr:false})` in a Server Component; never stack boundaries down one render path; shell-reachable handler machinery → `await import()` in the handler body. The OTHER build-bloat class is a heavy client component statically imported into a route/server chunk (15→24 min incident; eslint static-import bans guard these, ref `contextMenuV3StaticImportBan`). **Build failing (SIGKILL/OOM) or build time ballooning? Read the SIGKILL phase line first, then the `code-splitting` skill rule 3 + [docs/handoffs/build-graph-fragmentation-campaign.md](./docs/handoffs/build-graph-fragmentation-campaign.md).** Invoke the `code-splitting` skill before adding ANY dynamic import, making a component lazy, or touching how a component enters a chunk.
- Dynamic rendering by default. **`'use cache'` is NOT available** — `cacheComponents` is off, so the directive is a build error. Enabling it is a deliberate change that updates this line and `next.config.js` together.
- **React Compiler is on** (`reactCompiler: true`) — no manual `useMemo` / `useCallback` / `React.memo`. Costs ~13% build time (10.6→12.0 min, measured 2026-07-18); that trade is settled. Flipping it off means rewriting this rule in the same change.
- `proxy.ts` (not `middleware.ts`) — auth, route guards, redirects only.
- **State:** Redux RTK for all global state. Extend existing slices; never spin up parallel or local state.
- **Types:** generated types are the source of truth — `types/database.types.ts` (Supabase) + `types/python-generated/api-types.ts` (OpenAPI). Strict, no `any`; never hand-mirror or widen a generated type. Standards: [`TYPESCRIPT_STANDARDS.md`](./TYPESCRIPT_STANDARDS.md). **Fixing a type error or writing Supabase query/RPC code? Invoke the `type-safety` skill first** — silencing an error (cast / suppression / shadow type) is the opposite of fixing it; a real fix changes the code and the data, and an error you can't fix properly gets escalated with a decision brief, never hidden.
- **Realtime:** Supabase Broadcast for ephemeral messaging/presence; Postgres Changes only when RLS-driven authorization is required. **Every `postgres_changes` consumer MUST suppress its own write echoes with a timestamp-monotonic `updated_at` guard** — your echo arrives 50–500ms AFTER your REST response, so a flag-only "saving" check always misses it — and list hydration is ONE batched dispatch, never dispatch-per-row. This is the recurring browser-freeze class (~10 incidents): **invoke the `supabase-realtime` skill** before writing or modifying ANY `.channel(` subscription, echo handling, or autosave↔realtime loop (history: [`features/notes/FEATURE.md`](./features/notes/FEATURE.md) § Freeze-loop doctrine).
- 🚨 **NEVER hand-render a stream. Doing it once is how this platform dies.** Streamed model output — markdown, `__kind` JSON, tool calls — renders through the ONE canonical pipeline (`MarkdownStream` → `EnhancedChatMarkdown` → `BlockRenderer` → the kind registry), which already parses, routes, upgrades late schemas, finalizes, and recovers. A surface that buckets its own chunk text, opens its own `useLiveJsonRegion` parse session, splits multi-payload text, or hand-routes an envelope into a kind component is **forbidden** — no matter how small or unimportant the surface. `useLiveJsonRegion` is internal to content-ir, **not** a primitive you may consume. **Arman's ruling, 2026-07-28, in anger:** one bespoke renderer becomes tens of thousands of hard-coded ones, the single canonical system is gone, and the company is dead. There is no size of feature that earns an exception, and "it's just a small side page" is the exact argument that produced the two violations we HAD — both deleted 2026-07-29. **Enforced by ESLint: `matrx/no-bespoke-stream-renderer` (error).** Need streamed content rendered outside `/chat`? It needs a `requestId`, and there are exactly two ways to get one: launch through the execution system (a shortcut / `launchAgentExecution`), or — when the run is orchestrated SERVER-side inside a pipeline endpoint — **adopt its stream with `adoptForeignStream`** (`features/agents/redux/execution-system/thunks/adopt-foreign-stream.ts`, passed to `callApi`'s `consumeStream`), then render `<MarkdownStream requestId=…/>` and read `selectKindEnvelope`. That gap — a pipeline stream having no requestId — is what forced the one real violation; it is closed. Read [`features/content-ir/FEATURE.md`](./features/content-ir/FEATURE.md) first.
- **Errors:** every async op has structured error handling. Never swallow.
- **Loud recovery:** build protective/recovery layers, but every recovery/fixer **screams when it fires** — a recovery firing means a real bug got past the proactive layer.

### Supabase

- **Project:** `txzxabzwovsujtloxrus` (Matrx Main, `us-west-1`, Postgres 17). The only DB this repo talks to. `NEXT_PUBLIC_SUPABASE_URL` → `db.matrxserver.com`. Always pass `project_id: "txzxabzwovsujtloxrus"` to Supabase MCP tools — do not guess between Matrx Main / My Matrx / Matrx Flow / Matrx DM / Matrx Games.
- **Clients:** `@/utils/supabase/client` (browser), `@/utils/supabase/server` (SSR). `createAdminClient()` is restricted — see Protected Resources.
- **🚨 ONE connection, ONE name — read before touching any DB/config/env resolution:** `/Users/armanisadeghi/code/common-docs/policies/package-vs-implementation.md`. Every `matrx-*` package must stay fully independent (owns its schemas, ships its migrations, runs alone) — never delete a capability to "simplify". Our implementation is one company, one server, ONE database — every instance points at Matrx Main, a deployment CHOICE, not a package limit. The banned thing is a **second candidate for a connection** (`SUPABASE_URL` beside `NEXT_PUBLIC_SUPABASE_URL`, `<X>_DATABASE_URL` → `DATABASE_URL`, any `?? process.env.<other name>` chain): one name, required, throw if absent — pointing at a different DB is a change of VALUES, never a new variable name. The only DECLARED separate product DB is the HTML CMS project (`NEXT_PUBLIC_SUPABASE_HTML_URL`).
- **Canonical standards:** [docs/official/db-rules.md](docs/official/db-rules.md). Its §6 carries THE SECURITY PHILOSOPHY: **real security = the right people get in without blinking AND the wrong people can't get in at all — over-tightening is a defect** (blocked legitimate users are as serious a bug as intruders; forced workarounds are how real holes get made). Three absolutes: **access NEVER depends on the active organization** (checks key on the user — gating anything on the selected/active org is a defect); **`visibility='personal'`** (renamed from `private` 2026-07-21) **means "belongs to an individual person"** — their chats/DMs, almost nothing else; org work defaults `internal`, scraped/derived data defaults `public`; and **never add a new security layer/check on your own authority** — use the existing tiers, resolver, and grants with the correct openness. **THE VIEW LAW:** RLS is the ceiling, NEVER the view definition — every list query declares its own scope (`mine` by default; shared-with-me/org are deliberate destinations); a bare RLS-filtered list read is a defect that floods personal spaces when access widens. Many tables moved from `public` into domain schemas — on any DB error, check the table's live schema first. **Spot a stale table reference or a non-canonical table while working? You own it:** report it and migrate the table + every consumer, client AND server — for code in other repos, write the exact prompt and hand it to the user to relay to that repo's agent.

### Forbidden relationship shortcuts — fix on sight

These are active platform defects, not tolerated legacy patterns:

- **`platform._mirror_fk_to_assoc` is forbidden.** No trigger, function, migration, or application path may call, create, preserve, copy, or “repair” it. A physical FK mirror can pass a table name where the association system requires a canonical entity token, and it creates two competing relationship authorities. Write canonical `platform.associations` edges through the registered association path instead. Any runtime firing or discovered dependency is a **critical alarm**, never a recoverable warning.
- **A feature/domain table may not depend on a project FK.** Do not add or preserve `project_id REFERENCES ...` as feature ownership, lifecycle, authorization, or required persistence. Project membership is an optional `platform.associations` edge between canonical entity tokens; the feature must create, load, run, update, and delete correctly with no project at all. This specifically includes every research table and applies to new tables everywhere.
- **Focused fix-on-sight ownership:** when the table or feature currently being worked on contains either violation, the agent owns removing it end-to-end in that focused change—live constraint/trigger, migrations, generated types/models, frontend and server readers/writers, tests, and data backfill. Do not turn an unrelated task into a blind repo-wide rewrite, but do not leave either violation in the area being changed. Before creating or altering a table, explicitly inspect its triggers and FKs for both patterns. Until automated guards exist, discovery itself must be reported loudly and remain in [FOUND_DEFECTS.md](FOUND_DEFECTS.md).

### Database migrations — the DB is the source of truth, NOT the files

> A `.sql` file in `migrations/` changes **nothing** until applied to Supabase — writing one and reporting "done" is the single most damaging mistake here. A migration is done only when **applied AND verified live AND `pnpm db-types` regenerated.**

App code has **no DDL path** (Supabase JS / PostgREST only); agents apply DDL via the **Supabase MCP** (`apply_migration` / `execute_sql`, project `txzxabzwovsujtloxrus`).
- **Apply + record:** migrations MUST be **idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`). After applying, upsert the shared cross-repo ledger `public._schema_migrations` (key `(source, filename)`; `source='matrx-frontend'`, `checksum` = SHA-256 of file bytes) — it spans aidream / matrx-frontend / matrx-extend (one shared DB). aidream's `python db/apply_migrations.py --source matrx-frontend` batch-applies and records the ledger itself; from here, the MCP one-off + ledger write is the path. **`./scripts/release.sh` applies pending FE migrations the same way before bumping** (needs a co-located aidream checkout, or `AIDREAM_DIR`; skip with `--no-migrate`).
- **Verify (loud):** `pnpm check:migrations` diffs `migrations/*.sql` vs the ledger and screams about anything unapplied or **drifted** (file changed since recorded). Run it yourself — it is part of `pnpm check:release-gates`, not of any commit hook. Then confirm the column/function/trigger exists live via `execute_sql` before reporting done.
- **Regenerate:** `pnpm db-types` → `types/database.types.ts` (or `pnpm sync-types` for DB + Python API types + type-check).
- A migration that must never apply gets `-- migrate: skip: <reason>` in its first 25 lines.

**Schema truth-check — code vs the LIVE DB.** `pnpm check:schema` pulls the live schema (via the `public.schema_truth_snapshot()` RPC → committed `scripts/schema-check/current-schema.json`) and diffs it against the generated types, every direct `.from()/.schema()`, raw `schema.table` strings, and the dead-relations registry — catching moved/retired-table 404s that have no build error. Loud + non-blocking; `pnpm check:dead-relations` is its fast offline subset. **Drift in an autogenerated file (`database.types.ts`, `types/python-generated/*`, `dead-relations.json`) means edit the SOURCE and regenerate — the report says which command.** Read [`scripts/schema-check/FEATURE.md`](./scripts/schema-check/FEATURE.md) before adding a check or touching the guard.

**Typecheck with `pnpm type-check` — never a hand-rolled `tsc -p tsconfig.json`.** Next build output (`.next` + every `NEXT_DISTDIR` variant a parallel agent's dev server creates: `.next-preview`, …) stays excluded from tsc AND eslint via the `.next*` glob — `next dev` *appends* its distDir types to `tsconfig.json`'s `include` on boot, and one truncated machine-written validator (dev server killed mid-write) makes `tsc` report 3 syntax errors and **nothing else**, hiding every real type error while looking green. `pnpm check:tsconfig` guards the exclude; `pnpm clean:next` removes stale alternate build dirs.

**`pnpm type-check` is the ONLY type gate — the build does not check types.** `next.config.js` sets `typescript.ignoreBuildErrors: true`, so a red type error still deploys. Run `pnpm type-check` before you report a task done; never assume a green build means green types. Excluding a path from `tsconfig.typecheck.json` to make it pass is banned — that is how 485 shipped files sat outside the gate for three weeks (D63).

**Invoke the `finalize-and-ship` skill** at the end of any task — it runs migrations + type sync + the other pre-push checks before committing.

### YOU commit and YOU deploy — code on your disk has changed nothing

Same rule as migrations, one layer up: **a commit that is not pushed, and a push that is not deployed, has delivered zero value.** Finishing the code is the middle of the job. Work left sitting locally is worse than not started, because the next agent reads it as shipped. Commit as you go, in small commits; don't ask permission for routine work, and don't end a turn with a dirty tree or unpushed commits.

> ### 🚨 `git push` DEPLOYS NOTHING. `./scripts/release.sh` is the ONLY way to build.
>
> Vercel skips every commit whose first line is not release-prefixed, so a plain
> `git push` to `main` ships your code to GitHub and **to no user, ever** — no
> build starts, and the deployment shows as `CANCELED`. There is no timeout to
> wait out and nothing to poll: production simply stays on the last release.
>
> **If you want it live, run `./scripts/release.sh` (or `./ship.sh`).** That is
> the only approved path — it runs the gates, applies pending migrations, bumps
> the version, and writes the `release:` prefix that lets the build run.
>
> Written because an agent pushed a fix, watched six `CANCELED` deployments,
> polled production for 70 minutes, and concluded that "concurrent pushes were
> canceling the build" — when the real answer was that it never ran `release.sh`.
> **Never disable a check in this script to get a build out** (a `TEMP_SKIP…`
> flag once silently disabled migrations, protocol sync, attribution, and gates
> for every release until someone noticed). Emergency skips use the existing
> `--no-migrate` / `--no-gates` flags, per-invocation.

- **Deploy:** `./scripts/release.sh` / `./ship.sh` (applies pending FE migrations, bumps, tags, pushes). **Vercel builds ONLY for release-prefixed commits** (`vercel.json` → `scripts/vercel-ignore-build.sh`) — plain pushes to `main` are skipped so agent traffic cannot start a second overlapping ~20-minute production build. The prefix picks the deployment (see Build gate): `release:` → main app only; `release-admin:` / `release-demos:` → that subdomain only; `release-all:` → all three. Ship a satellite with `./ship.sh "msg" --target admin|demos|all`. Sibling repos: `aidream` → its own `./scripts/release.sh` (Coolify auto-deploys on push; `/health/version` returns the deployed git SHA — compare to `origin/main`). `my-matrx` → push to `main` (Vercel GitHub integration).
- **PR/branch sessions: your code auto-merges to `main` and goes LIVE within ~30 minutes; branches are then deleted.** Nobody reviews PRs — they auto-approve. There is no not-yet-live code: never document "not deployed yet" / "pending merge" (false within the half hour, and Arman reviews only the live app), and never spend output deciding what to do with your PR.
- **Report deployed state, never intended state.** "Built and verified" ≠ "shipped". If you didn't deploy, say so in the same breath as the completion claim.
- **Verify against production, not localhost** — hit the real URL and confirm your change answers there.
- **Half-deployed is the dangerous state.** For a cross-repo feature, shipping only some repos can break a surface that previously worked (page JS calling a global that exists only in the undeployed half fails harder than the old code did).
- Ask first only when the blast radius is outside the task — a live client site, a destructive migration. Otherwise ship it.

This is written because it was violated: CMS per-site collections was fully built, hardened across four adversarial rounds and documented as "shipped" while the entire visitor half sat in 13 unpushed commits — production served none of it, and the demo page was *actively broken* there, referencing a helper that existed only on a laptop.

---

## File Organization

- General: `/components`, `/hooks`, `/utils`, `/constants`, `/types`, `/providers`.
- Features: `/features/[name]/` with `types.ts`, `components/`, `hooks/`, `service.ts`, `utils.ts`, `constants.ts`, `state/` (or `redux/`).
- Route → feature: `app/(core)/notes/page.tsx` → `features/notes/`.
- Never write to project root. One `README.md` per feature, only after the code is tested.
- **Barrel files (`index.ts` re-exports) are being eliminated.** Don't create new ones. Import from source. ESLint enforces. Replace existing barrels opportunistically when editing a file.

**Do not invent new top-level features.** A feature is a big, distinct piece of app functionality, usually with multiple routes. Introducing one is the user's call, not yours. Default to extending an existing feature; if a new feature seems genuinely warranted, ask first.

### Every dependency comes from the npm registry — never raw GitHub

A `github:` / `git:` / tarball spec in `package.json` forces `pnpm install` to reach
`codeload.github.com`. Any environment that allows the registry but blocks raw GitHub — sandboxed
CI, locked-down corp networks, cloud agent sessions — then cannot install this repo at all, and
`--frozen-lockfile` dies with `ERR_PNPM_FETCH_403`. A spec with no ref is also a supply-chain
hazard: it floats to whatever a third party's default branch happens to be.

`pnpm check:registry-deps:strict` enforces this. If a package must be patched, vendor it (see
`hooks/usehooks/`, copied from `@uidotdev/usehooks` 2.4.1 after that exact trap) or publish it —
do not point a dependency at a git host.

### Route groups (2026-05-26 reorg)

The `app/` tree splits into purpose-named route groups. **Working on core product? Default to ignoring `(transitional)` and `(dev)` unless the task names them.** When in doubt, work in `(core)` and ask before touching others.

| Group | Purpose | URL | Build |
|---|---|---|---|
| `(core)` | **Production main app.** Slim modern shell, no entity system. New core work goes here. | `/chat`, `/agents`, `/files`, `/notes`… | `full` / `core` / `user` / `slim` |
| `(admin)` | **Production admin.** Super-admin gated at layout level. Deploys as manage.aimatrx.com. | `/administration/*` | `full` / `core` / `admin` |
| `(transitional)` | **On the way in/out.** Being (or to be) replaced by `(core)`; not ready to delete. Lower priority. | `/apps`, `/dashboard`, `/settings`, `/scraper`, `/projects`, `/ai`, `/applets`, `/news`… | `full` / `core` / `user` / `slim` |
| `(dev)` | **Internal demos / tests / experiments.** Auth-required. Deploys as demos.aimatrx.com. | `/demos/*` | `full` / `user` / `demos` |
| `(public)` | Marketing / legal / share / education / canvas. | `/legal`, `/share`, `/p`… | `full` / `core` / `user` / `slim` |
| `(auth-pages)` | Login / signup / etc. | `/login`, `/sign-up`… | always |
| `(popup)` | OAuth popup chrome. | `/popup-window/*` | `full` / `core` / `user` / `slim` |
| `(oauth-review)` | Google OAuth verification review surface — what Google's reviewers open to see each requested scope in use. | `/google-workspace-review` | always |

**`(legacy)` and `(public-demos)` are DELETED** (entity system removed; public demos relocated). Never create files there. `pnpm check:doc-claims` fails if this table and `app/` disagree.

**Shell:** `(core)` and `(admin)` both render `AppShell` (`features/shell/components/AppShell.tsx`): sidebar + transparent header + `#shell-header-center`. **`(core)` routes:** route chrome via `<PageHeader>`, body `h-full overflow-hidden` — see [`features/shell/components/header/variants/USAGE.md`](./features/shell/components/header/variants/USAGE.md); **fixing or building any `(core)` route header/body → invoke the `core-route-headers` skill** (classification, exemplars, mobile bottom-sheet rules, browser verification). **Admin exception:** content sits below the header (not behind it) via scoped `styles/shell.css` rules — admin pages may use `h-[calc(100dvh-2.5rem)]`. `(transitional)` still uses `ResponsiveLayout`.

**Build gate — one repo, THREE Vercel projects (2026-07 deployment split).** The full app OOMs a single Vercel build, so it ships as three deployments whose union is the full app: **`ai-matrx`** → aimatrx.com (main app), **`ai-matrx-manage`** → manage.aimatrx.com (`(admin)`), **`ai-matrx-demos`** → demos.aimatrx.com (`(dev)`). `next.config.js` — env `MATRX_PROFILE=full|core|user|slim|admin|demos` **wins** (each Vercel project pins its own); `FORCE_MATRX_PROFILE` (code) is only the default when env is unset (`null` → `full`). Matrix: **`(dev)`** routes in `full`/`user`/`demos`; **`(admin)`** in `full`/`core`/`admin`. **`slim`** = main app only; **`admin`**/**`demos`** = ONLY their surface + `(auth-pages)` + `app/api` (they park the other groups). Excluded groups are renamed `app/(x)` → `app/_x_build_excluded` for the process lifetime (gitignored; `app/(dev)` is never parked — its route leaves filter via `pageExtensions`). **Cross-group `app/(x)` imports are banned** — they break parked builds; import from `features/`/`components/` instead (`(dev)` helper imports tolerated). `proxy.ts` bridges the hosts: a build missing `(admin)`/`(dev)` redirects `/administration/*`/`/demos/*` to the sibling origin, and satellite hosts bounce foreign paths back to the main host. Auth spans the subdomains via the domain-wide renamed cookie — see `utils/supabase/authCookie.ts` (every Supabase client MUST pass its options).

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
2. No direct object-store SDK calls. Every file operation goes through `features/files/**`; ESLint enforces the boundary.
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

## Pattern Patrols — recurring mistakes become scheduled, certified sweeps

System (canonical, cross-repo): `/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/FEATURE.md` + its `PATROL_REGISTRY.md` (10 live patrols: dead ends, unused primitives, mobile breakage, light/dark, copy-everywhere, emojis, browser dialogs, bare Loading, coming-soon compliance, type-suppression debt). Recurring runs execute in Codex; certification by a second adversarial agent is mandatory for every fix batch. **Two standing duties for EVERY agent in this repo — invoke the `pattern-patrol` skill for the mechanics:**

1. **Log sightings, don't fix off-mission.** Spot a violation of a registered patrol while doing something else → one line in [`.matrx/PATROL_SIGHTINGS.md`](./.matrx/PATROL_SIGHTINGS.md), keep moving.
2. **Nominate patterns.** When a mistake you're fixing is a recurring CLASS (third occurrence, past Arman rant, a check you wish existed) — stop and tell Arman it's a patrol candidate, with real grep counts as evidence. The registry is meant to grow from 10 toward 50+.

## Found defects & task tracking

Track bugs/gaps you can't fully fix in [FOUND_DEFECTS.md](./FOUND_DEFECTS.md) (the frontend twin of aidream's). If a fix is partial, record what's open there — a defect that lives only in a chat log will recur. Task system files: `FOUND_DEFECTS.md` (unapproved discoveries), `CURRENT_ERRORS.md` (error-dump inbox), `.matrx/AGENT_TASKS.md` (the only approved worklist), `.matrx/ARMAN_TASKS.md` (Arman-only asks), `.matrx/PATROL_SIGHTINGS.md` (registered-pattern sightings — see Pattern Patrols above).

## 🚨 An env var is a VALUE, never a TOGGLE — a flag in env fails silently and invisibly

> **This rule exists because it was broken.** `NEXT_PUBLIC_FILES_BROWSER_CUTOVER` was added as a
> panic gate when a CORS preflight 405'd. The CORS bug was fixed days later — and the flag sat at
> `false` in production for two weeks, silently routing every browser upload back to the old server
> while the docs described the cutover as done. **Arman had no idea the flag existed**; he assumed
> the migration had shipped. Nothing was broken, nothing was logged, weeks of paid-for work were
> simply inert. Deleted 2026-07-28.

- **Legitimate env var:** a value that genuinely differs per environment and cannot be known in
  code — a URL (`NEXT_PUBLIC_FILES_URL`), a publishable key, a Supabase project ref. Give it a
  hardcoded production default so a missing value cannot silently degrade to a legacy path.
- **NOT an env var:** a feature toggle, a rollout gate, a "cutover" switch, an engine choice, a
  model name, a threshold. Those are **`CAPS` constants at the top of the file**. Flipping one
  then takes a code push — that's the point: it's reviewable, greppable, and it can't be forgotten
  in a dashboard nobody opens.
- **Architecture is not configuration.** Which service owns a route, which pipeline handles a
  type, which component renders a kind — decided in code, unconditionally. If you're tempted to
  gate a migration behind a flag "just until we verify," you are building the exact trap above:
  write the verification into a test, ship the cutover, and delete the escape hatch.
- **`process.env.X === "true"` in product code is the smell.** It is currently confined to build
  scripts; keep it that way. If a genuine emergency kill-switch is unavoidable, it is a `CAPS`
  constant plus a loud console/log banner whenever the non-default path is taken — never a silent
  read.

- **One value, ONE variable name.** Never a second candidate or a `?? process.env.<other name>` chain for the same URL/key/connection — that is the mechanism that silently bound live shared tables to the wrong database. See §Supabase → package-vs-implementation.md.

Same doctrine, server side: aidream's `../aidream/CLAUDE.md` §"A new env var fails SILENTLY in production."

## Assists — AI assists everywhere (Arman's standing ruling, 2026-08-08)

**The system uses its own AI on itself.** Every friction point, error state, or gap gets asked *"could an AI button/chip do this for the user?"* BEFORE a manual affordance is designed. The primitive is **`features/assists/`**: producers (deterministic code, background agents, sweeps) write `platform.assists` rows or render ephemeral chips; the user one-clicks; the assist action registry runs a REAL action (launch a pre-filled agent, apply a surface write, navigate). **Building or touching any page? Ask which assists IT needs and mount them in place with `<AssistStrip surfaceName="…"/>`** — the global dock is the ambient overflow, never the substitute. **THE INTENTIONAL-ACTION LAW:** a chip never runs on click — hover/click expands the full card; only the verb-labeled button (with explainer + receipt, `runtime/action-descriptors.ts`) executes. Rules + producer contract: [`features/assists/FEATURE.md`](./features/assists/FEATURE.md); cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md`. Never fork a second chip component, suggestion table, or accept handler — that disease is what this primitive killed.

## "Coming Soon" is a promise — track it like a found defect

We deliberately advertise actions we intend to build so users see where the product is going and engineers feel the debt. **Growing the list is encouraged.** That only works if every promise is declared in ONE registry — `lib/coming-soon/registry.ts` — and handled with the same reflex as [FOUND_DEFECTS.md](./FOUND_DEFECTS.md): **report it, and ask to solve it.**

- **Never render a bare "coming soon" string, toast, or stub modal.** Register the entry, then call `announceComingSoon(id)`. An unregistered id throws in dev — an untracked promise is exactly what this prevents.
- **Touching a feature that owns a Coming Soon entry? Name it in your summary and offer to build it.** Never leave it silently.
- `stage: "blocked"` requires `blockedBy`. Delete the entry in the same change that ships the feature.

Rules + stages: [`lib/coming-soon/FEATURE.md`](./lib/coming-soon/FEATURE.md).

## Feature entry lists — the canonical shell

**The list page every feature should have is a config on the ONE shell: `lib/entity-list/` ([`FEATURE.md`](./lib/entity-list/FEATURE.md))** — `<EntityListPage config={...} />` with table-first + ONE `…` menu carrying every record action, card/dense views, and **Mine / My Orgs / Shared / Public** scopes with true server counts. Live consumers: `/agents/all` ([`features/agents/browse/FEATURE.md`](./features/agents/browse/FEATURE.md), the proving ground) and `/transcripts`. Building or fixing a feature's list page? Write a config (service RPCs per `lib/list-scope/FEATURE.md` + column registry + row-actions hook), never a fifth bespoke variant:

- **View style persistence** → `useListViewPrefs` ([`lib/list-views/FEATURE.md`](./lib/list-views/FEATURE.md)). Style persists (view, density, sort, page size, columns); query never does (search, filters, page, scope). Every hand-rolled list-style `localStorage` copy is migrated (last four, 2026-08-09) — **a new one is a defect**; a surface whose toggle isn't `table`/`cards`/`rows` maps onto `view` + `density`, never a cast. (Page-*layout* toggles — which panes are on screen — are a different axis and stay off it.)
- **Row actions** → one `ItemMenuConfig` builder per entity (`components/official/item/`), consumed identically by table, cards, rows, and right-click. Three divergent hard-coded action lists for one entity is the defect this kills.
- **Table** → `MatrxDataTable` in **controlled** mode when paging server-side. **Every column sorts AND filters — no exceptions**, and finite value sets get real options with counts. A filter the server can't serve must not render at all; a control that silently filters one page is worse than none.
- **Full-row click** opens the record (pointer cursor); interactive cells stop propagation. Fields the user can see and easily change (name, description, category, tags) edit **inline**.

## Agent Review Queue — anything you build that Arman must see

Built a demo page, new route, or reviewable UI surface Arman didn't watch you make? **Register it in `agent.review_queue` before ending the turn** — a "please test /demos/foo" buried in a chat message will never be seen. He reviews at `/administration/users/agent-review`; his feedback comes back through the same table, and you archive the row once handled. **Invoke the `agent-review-queue` skill** for the exact INSERT/feedback/status contract.

## Handoffs

`docs/handoffs/` holds forward-looking work orders (shared system with aidream — one doc per piece of work). **Invoke the `handoffs` skill** before writing one, taking one over, or ending any turn that progressed work a handoff covers — completed tasks collapse to one bullet, finished handoffs get deleted. Rot backstop: `/handoff-cleanup`.

---

## Feature Documentation

Every Tier 1/2 feature has a `FEATURE.md` — the single source of truth for that feature. CLAUDE.md is just the index. Template: `features/_FEATURE_TEMPLATE.md`. User-facing `README.md` may coexist.

**Non-negotiable:** after any substantive change, update the matching `FEATURE.md` (status, flows, entry points, invariants) and append to its Change Log (date + one-line summary). Cross-feature changes update every doc affected. Stale docs corrupt every future agent's mental model — treat doc updates with the same weight as code changes in the same PR.

**Editing this file, any `FEATURE.md`, `PRINCIPLES.md`, or a `SKILL.md`?** Invoke the `context-docs` skill first — every doc edit is a full-document review (place it right, merge don't stack, lose no rule, max punch per word).

**Cross-repo truth lives in `/Users/armanisadeghi/code/common-docs/` (its own repo) — ONE doc, pointer lines in each touched repo, NEVER a per-repo copy.** Documenting anything that spans repos (e.g. `common-docs/systems/cms-system/FEATURE.md` for the CMS platform)? **Invoke the `cross-repo-docs` skill.**

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
| Assists (AI assists everywhere — one-click AI chips) | `features/assists/FEATURE.md` |
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
| **Marketing domain** (umbrella — five peer pillars: brands/websites, content planning, search & keywords, SEO tools, data & operations). **Every marketing surface lives under `/marketing/*` — never a root-level route**; `/seo/*` is reserved for the `(public)` anonymous analyzers. Structure declared once in `features/marketing/lib/marketing-nav.ts` | `features/marketing/FEATURE.md` — canonical pillar table; **never create a sibling `features/seo-*` / `features/content-*`** |
| ↳ Content Plan (`plan` schema client: tree editor + node panel + pillar map at `/marketing/content-plan`; cross-repo SoR `common-docs/systems/content-planning/FEATURE.md`) | `features/marketing/content-plan/FEATURE.md` |
| **Growth Loop** — the twelve-stage pipeline research→plan→pages→live site→crawl→findings→fixes, scored on THE THREE PIPES (code/human/AI). **`features/growth-loop/map/loop-map.ts` is the ONLY place its stage/connection/gap statuses live** — flip a gap there in the same change as the code; never restate a status in a doc. Map: `/administration/knowledge/growth-loop`. Vision + campaign: `common-docs/systems/growth-loop/` | `features/growth-loop/FEATURE.md` |

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
| CMS (client sites + standalone HTML pages, separate Supabase project `viyklljfdhtidwecakwx`; agent-activity visibility surface at `/administration/knowledge/cms-agents`) | `features/cms/FEATURE.md` |

---

## Agent Feedback API

Cross-project issue tracker.

- MCP: `app/api/mcp/[transport]/route.ts` · REST: `app/api/agent/feedback/route.ts`
- Bearer auth against `AGENT_API_KEY` — `lib/services/agent-auth.ts`
- Service layer (admin client, bypasses RLS): `lib/services/agent-feedback.service.ts`

---

## Official Component Library

- Components: `components/official/` · Demos: `app/(admin)/administration/ui/official-components/component-displays/` · Registry: `app/(admin)/administration/ui/official-components/parts/component-list.tsx`
- Must work on import — no local restyling.
- Never delete existing components.

---

## UI / UX Standards

- **Icons:** Lucide only. **No emojis** anywhere a user can see — UI, chips, titles, seed data. Matrx is enterprise.
- **Backgrounds:** `bg-textured` for main backgrounds.
- **Colors:** semantic classes only (`bg-card`, `bg-muted`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `text-primary`, `border-border`). Tokens, elevations (`--elevation-1/2/3`), and gradients (`--gradient-1/2/3`) defined in `app/globals.css`. Token-only color rules + old→semantic mapping: `.claude/skills/ui-dense/data-dense-rules.md` §1.
- **Loading:** component-library loading states. Never plain "Loading…" text.
- **Layout:** space-efficient, minimal padding/gaps. **`(core)` AppShell routes:** route chrome in `<PageHeader>`, body wrapper `h-full overflow-hidden` — **never** `h-page` or `calc(100dvh - header)` (`.shell-main` is already full viewport). See [`features/shell/components/header/variants/USAGE.md`](./features/shell/components/header/variants/USAGE.md).
- **Scroll chains:** `flex-1 min-h-0` bounds a scroll area **only if EVERY ancestor is `flex flex-col`** — and the breaking wrapper is usually in ANOTHER file. One block wrapper leaves the surface at height:auto until an `overflow-hidden` ancestor clips it: no scrollbar, unreachable rows, nothing thrown. Two guards, each sufficient: `pnpm check:scroll-chain` (static, in-file + across component boundaries) and `useClippedContentGuard` (`lib/layout/`, runtime → Error Inspector `layout-scroll-chain`; every `MatrxDataTable` consumes it — **so must every new scroll surface**). `h-full` needs no flex parent, only a definite-height one.
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

After the May 2026 overhaul (see `docs/archive/2026/OVERLAY_WINDOW_OVERHAUL.md`), what was one conflated system is now two:

1. **Overlay system** — the controller that renders any component (dialog, sheet, modal, window, toast) at the top of the tree on dispatch. Lives in `features/overlays/`. Has explicit JSX prop wiring (no `{...spread}`) so TypeScript catches dispatch/component drift. **Invoke the `overlay-system` skill** before opening / adding / debugging an overlay.
2. **WindowPanel component + Window Manager** — the draggable/resizable frame primitive (`WindowPanel.tsx`), the tray (`WindowTray.tsx`), the runtime registry slice (`windowManagerSlice.ts`), and the persistence machinery. Lives in `features/window-panels/`. A `<WindowPanel>` rendered anywhere joins the runtime manager and participates in minimize-all, focus, persistence — regardless of whether the overlay controller rendered it. **Invoke the `window-panels` skill** for tasks scoped to the component / tray / manager / persistence.

Hard rules: no JSX prop spread in `features/overlays/OverlayController.tsx`; no `kind: "window" | "modal"` discriminator; no callback functions through Redux (use the opener's `onX` props — the callback registry is hidden inside); the overlay catalogue is metadata-only and is NOT iterated to render.

**Killing a panel/overlay for good?** **Invoke the `remove-window-panel` skill** — the reverse-operation checklist for deleting an overlay across all ~10 registration sites and leaving no shim, fallback, or dead name behind.

---

## Cross-Repo — Token Broker (scoped short-lived credentials)

**A client needing temporary privileged reach (provider realtime sessions, direct provider calls) mints a brokered credential from aidream `POST /api/broker/tokens` — NEVER holds a long-lived provider key.** The client primitive lives at `lib/api/broker/` (typed envelope, mint client, refresh-ahead cache, mode dispatch, hooks) — **invoke the `token-broker-client` skill** before wiring any provider connection from client code. Contract: [`lib/api/broker/FEATURE.md`](./lib/api/broker/FEATURE.md); cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/token-broker/FEATURE.md`. Test harness: `/demos/token-broker`.

## Cross-Repo — Applications (our shipped clients: config, catalogs, fleet)

**"Application" means a client WE ship (desktop, extension, mobile). "App"/"apps" is reserved for user-created agent apps — never label anything in this hub "Apps".**

One admin hub at **`/administration/applications`** (`features/admin/applications/`) governs every shipped client, as five real routes (each a deep-linkable tab): **Overview** (per-application health; screams when installed instances run below `min_supported_app_version`), **Configuration**, **Catalogs**, **Installations**, **History**.

- **Configuration** — non-secret runtime values (server URLs, flags, min versions, operator notices) in one anon-readable `public.app_config` row per application, read by every installed copy in the field. Writes ONLY via the `admin_update_app_config` RPC (diff-confirmed save, history/restore). Code: `features/admin/applications/config/`. **Live since 2026-07-14.** System-of-record: `/Users/armanisadeghi/code/common-docs/systems/app-config/FEATURE.md`.
- **Catalogs** — `public.catalog_entries` (local LLMs, LoRAs, image/video/TTS models, presets, prompts); kind-aware editors, dual-gate activation with artifact probes, HuggingFace/Civitai link resolver. Writes ONLY via `admin_upsert_catalog_entry`. Code: `features/admin/applications/catalogs/`. System-of-record: `/Users/armanisadeghi/code/common-docs/systems/remote-catalogs/FEATURE.md`.
- **Installations** — the installed fleet via the `admin_list_app_instances` RPC, each instance's reported version compared against the live minimum. Version standing is decided in ONE place (`features/admin/applications/version.ts`) so Overview and Installations can never disagree; an unreported version is `unknown`, never laundered into a compliance failure.
- **History** — one merged audit timeline over `app_config_history` + `catalog_entries_history`, each row diffed against the prior snapshot of the same record. Restore stays on the two owning tabs, beside the write path.

Read the system-of-record docs before touching config or catalogs in ANY repo.

## Cross-Repo — Access Architecture (permissions, sharing, memberships, associations)

How a row becomes visible platform-wide — ownership, `iam.permissions`, `iam.memberships`, `platform.associations` conveyance, `visibility`, admin level — spans this repo, aidream, and the shared DB. Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/access-architecture/FEATURE.md` — read it before touching any permission/sharing/scope-access code.

---

## Cross-Repo — protocol + registry system-of-record pointers

- **Matrx Envelope pact** (this repo mirrors aidream's `docs/protocol/MATRX_ENVELOPE.md`/`MATRX_REFERENCES.md` byte-identically; aidream is canonical, `check-protocol-sync.ts --fix` maintains it): `/Users/armanisadeghi/code/common-docs/systems/matrx-envelope/FEATURE.md`.
- **Conversation-start contract** (`conversation_id` client-minted + `is_new` + `store` on every agent start; `callApi` is this repo's client half): `/Users/armanisadeghi/code/common-docs/systems/conversation-start-contract/FEATURE.md`.
- **Tool registry schema** (`tool.definition`/`tool.binding`/… — aidream owns; tool-call visualization consumes): `/Users/armanisadeghi/code/common-docs/systems/tool-registry/FEATURE.md`.

## Cross-Repo — matrx-extend

Chrome extension bridge for cross-surface workflows. Cross-repo channel map (system-of-record): `/Users/armanisadeghi/code/common-docs/systems/matrx-extend-integration/FEATURE.md`. The Phase 2 bridge has shipped (`chrome.runtime.sendMessage` + Supabase Broadcast substrates — see the header of `features/surfaces/data/surface-candidates.ts`).

- Connection map: [docs/MATRX_EXTEND_CONNECTION.md](./docs/MATRX_EXTEND_CONNECTION.md)
- Skill: `connect-matrx-extend`
- Master cross-repo doc (in matrx-extend): `/Users/armanisadeghi/code/matrx-extend/docs/CROSS_REPO_INTEGRATION.md`
- Task pipeline: `.matrx/` (TASKS_FROM_USER → AGENT_TASKS → AGENT_INSTRUCTIONS)

Pre-existing dead references that *look* like extension scaffolding but are not — do not touch in unrelated PRs:

- `utils/errorContext.ts:10` — defensive stack-frame filter

---

## Available Commands

`.claude/commands/` — run `/<name>` for specialized workflows (e.g. `/web-design`, `/nextjs-patterns`).
