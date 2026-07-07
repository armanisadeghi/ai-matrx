# P7 — Sharing & Public Access (the `useAccess` platform primitive)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 1 — FOUNDATIONAL CONTRACT.**
> Publish the `useAccess` interface on **day 1**; P1–P5 build against it without waiting.
> Read [`features/sharing/FEATURE.md`](../../../features/sharing/FEATURE.md) (including its
> 2026-07-07 change-log entry) and
> [`app/(core)/education/ROUTING.md`](../../../app/(core)/education/ROUTING.md) §2 first.

## Objective

Ship the missing product layer of sharing — a clean **view-vs-edit gate**, an **unauthenticated
public viewer**, and **duplicate-to-edit** — as ONE reusable platform primitive (hook + server
guard + route pattern) that every study tool and every other feature consumes. Shared content
must work like Google Docs/Quizlet: a view-sharee gets a great read-only experience and a fork
button, not an RLS error. This was the #1 gap in the flashcards audit and it blocks the entire
share/collaborate vision.

## Current state (verified 2026-07-07 — significantly moved since the roadmap)

- **The plumbing now works.** Token unification (2026-06-26) + the registry/owner-column fix
  (commit `ded0c6ecd`, 2026-07-07) mean `iam.permissions` grants actually grant on canonicalized
  tables (proven live for notes). Model: one `iam.permissions` table, `SECURITY DEFINER` RPC
  writes, RLS via `iam.has_access`, `platform.visibility` enum
  (`private < internal < link < public`), `platform.shareable_resource_registry` as source of
  truth.
- **There is an UNCOMMITTED token-vs-table reconciliation in `utils/permissions/`** (registry.ts,
  service.ts, orgResources.ts, OrgResourceList.tsx): introduces entity-token vs physical-table
  split, adds `resolveResourceToken()`, rewrites the TS registry to match the live DB, kills
  `physicalTable`. **Day-0 task: take ownership, land it, and drive the 38 pre-existing
  registry-parity test failures to ~0.** Nothing else in this project starts on a drifted mirror.
- **What does NOT exist (the product gaps — all confirmed open):**
  - No `useAccess`-style gate. `utils/permissions/hooks.ts` (`usePermissionCheck`/`useCanEdit`/
    `useIsOwner`) is explicitly UX-only; routes gate by nothing — a view-only sharee hits an edit
    page and gets silent RLS write failures. Flashcards defers this exact gap as "Wave-5"
    (`EditSetView.tsx:8-10`).
  - No generic public viewer. Bespoke routes exist per feature: `/p/[slug]` (published agent
    apps), `/share/[token]` (files, Python-signed), `/canvas/shared/[token]`. A public flashcard
    set/note/quiz has NO signed-out route.
  - No duplicate-to-edit anywhere (only a "Save as My Copy" warning modal in prompts).
- **FEATURE.md's "Current work" section is stale/self-contradictory** (old RLS-rollout gap vs the
  newer "grants really grant" note) — clean it up as part of your doc pass.

## Scope

**IN**
- **Land the uncommitted registry diff** + parity-test green.
- **The `useAccess` primitive (day-1 published signature):**
  `useAccess(resourceType, id)` → `{level: 'none'|'view'|'edit'|'admin', isOwner, loading}` —
  client hook built over `checkPermission`/visibility, UX-layer only (RLS stays the boundary) —
  plus a **server-side `requireAccess(resourceType, id, level)`** guard for server components so
  `[id]/edit` pages redirect view-sharees to the view route (per ROUTING.md §2: `[id]` view-gated,
  `[id]/edit` edit-gated).
- **Duplicate-to-edit:** a generic "Make a copy" flow for view-sharees — a registry-driven deep
  copy (RPC per resource family where needed), surfaced automatically where `useAccess` returns
  `view` on an editable surface.
- **Unauthenticated public viewer:** a generic registry-driven route (recommend
  `/p/e/[resourceType]/[id]` under `(public)`) serving `visibility in ('link','public')`
  resources signed-out via anon-safe reads, with per-kind renderers (flashcard set first). Keep
  the existing bespoke routes; document when each applies.
- **Per-user / per-org grant sharing UI** where the visibility enum is insufficient — the
  existing share modal machinery generalized, not a new dialog per feature.
- **Flashcards as the reference implementation:** wire the gate + duplicate + public viewer into
  the flashcards set routes (this IS the flashcards agent's deferred "Wave-5" — coordinate the
  hand-off, then own it).
- Documentation: the primitive's usage recipe in `features/sharing/FEATURE.md` so P1–P5 adopt it
  unchanged.

**OUT**
- The study tools themselves (they consume). Entitlements (P8). Org-share moderation internals
  (shipped 2026-06-06). Reachability-cascade enforcement (separate rollout, OFF-but-ready — don't
  flip it). New RLS policies outside `iam.apply_rls`.

## Deliverables / Definition of done

1. Registry diff landed; parity test ~green.
2. `useAccess` + `requireAccess` shipped, documented, and consumed by flashcards: a view-sharee
   opening `/flashcards/[setId]/edit` is redirected to the view page with a "Make a copy" offer.
3. Duplicate-to-edit produces a real owned copy (cards included) and lands the user in its editor.
4. A `public`-visibility deck is viewable signed-out at the public URL; a `link`-visibility deck
   works via its link; a `private` one 404s.
5. A second resource type (notes — sharing just fixed there) adopts the primitive **unchanged**,
   proving reusability.
6. `features/sharing/FEATURE.md` updated (including the stale "Current work" cleanup) + change
   log.

## Surfaces touched

- `utils/permissions/**` (land diff, add `useAccess`), `features/sharing/**`
- New `app/(public)/p/e/**` public viewer (or Arman's chosen shape — README flag 2)
- `app/(core)/education/flashcards/**` + `features/flashcards` (reference wiring — coordinate
  with the active flashcards agent)
- New/extended `SECURITY DEFINER` RPCs (duplicate-copy family, anon public reads) + migrations
- `features/notes` share surfaces (second adopter)

## Dependencies & contracts

- Canonical sharing system ✅ (post-fix), flashcards visibility ✅.
- **Publishes (day 1):** the `useAccess`/`requireAccess` signature — a stub returning
  `{level:'edit', isOwner:true}` behind the real interface is enough for P1–P5 call sites.
- **Coordination:** the flashcards agent (Wave-5 hand-off, README flag 6); whoever authored the
  uncommitted diff (README flag 7); P1 (new assessment tables must register in the registry —
  provide the recipe).

## Build guidance

- Anon public reads: the RLS anon path filters `deleted_at` (pub_read) — follow the established
  soft-delete RLS pattern; never gate authenticated policies on `deleted_at`.
- All writes via `SECURITY DEFINER` RPCs with auth checks inside — no direct-table mutation
  paths; invoke `protected-resources` thinking for any new RPC.
- Public viewer media must be durable (`<InlineMediaRef>`, never signed URLs — an anonymous page
  can't re-mint).
- `type-safety` for every query; `finalize-and-ship`; update the registry parity test as the
  enforcement backstop for future drift.

## Verification

Three-browser test (owner / view-sharee / signed-out): grant flows, gate redirects, duplicate,
public URL — all against real rows, verified in SQL. Then repeat the adoption on notes untouched.
Hand Arman the exact URLs + a three-persona test script.
