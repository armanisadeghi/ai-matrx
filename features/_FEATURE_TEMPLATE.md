# FEATURE.md — `<feature-name>`

> **Copy this template into any feature directory as `FEATURE.md`, fill every section, delete this line.**

**Status:** `active` | `stable` | `migrating` | `scaffolded` | `deprecated`
**Tier:** `1` | `2`
**Last updated:** `YYYY-MM-DD`

---

## Purpose

1–2 sentences. What does this feature do and who uses it? No marketing language.

---

## Entry points

**Routes**
- `app/(authenticated)/<path>/` — describe
- `app/(public)/<path>/` — describe

**Hooks**
- `useXyz()` — what it does, where defined

**Services**
- `features/<name>/service.ts` — role
- `lib/services/<name>.ts` — role (if cross-feature)

**API endpoints**
- `GET /api/...` — role
- `POST /api/...` — role

**Redux slice(s)**
- `features/<name>/redux/<slice>.ts` — shape

---

## Admin map

Every Tier 1 feature ships a super-admin-gated **feature admin map** at `/<feature>/admin` — the single utilitarian page where an admin can see every route, window panel, modal, component, API endpoint, Redux slice, and demo route this feature owns (including the ones that aren't reachable from the primary sidebar surface).

- **Map config:** `app/(core)/<feature>/admin/page.tsx` — a `FeatureAdminMap` object passed to `<FeatureAdminPage>`.
- **Primitive:** `features/admin/components/FeatureAdminPage.tsx` + `features/admin/types/featureAdminMap.ts`.
- **Live URL:** `/<feature>/admin` (404s for non-super-admins via redirect).

When you add a new route, window panel, overlay, modular component, demo, or API endpoint to this feature, **also append it to the admin map config**. The rendered page surfaces a yellow drift warning for any route under the feature's directory or any window panel whose registry slug starts with the feature's slug that isn't declared on the map.

---

## Data model

**Database tables** (Supabase)
- `<table>` — role; owner/RLS notes

**Key types**
- `<Type>` (`features/<name>/types.ts`)

---

## Key flows

Walk through 2–4 concrete flows, the real ones an agent will touch. For each:
- Trigger
- Path through the code (files + functions)
- State changes / side effects
- Exit condition

Keep sequential and specific. A flow that doesn't match the code is worse than no flow.

---

## Invariants & gotchas

Things that look wrong but are load-bearing. Things that break silently. Examples:
- "Never X, because Y breaks."
- "Z is cache-invalidated by tag `foo` — adding a new mutation must add `revalidateTag('foo')`."
- "Payload MUST include `<field>` even though TypeScript allows omitting it."

---

## Related features

- Depends on: `features/<x>`, `features/<y>`
- Depended on by: `features/<a>`, `features/<b>`
- Cross-links: other `FEATURE.md` paths worth reading in the same session

---

## Doctrine compliance

> Required by [PRINCIPLES.md](../../PRINCIPLES.md). The artifact is disposable; the platform is the product.

**Primitives reused** — every type, component, slice, hook, and service this feature *consumes* from elsewhere. One bullet each.
- Types: `<list canonical types imported from types/ or other features>`
- Components: `<list components/official/, components/ui/, or feature-exported components used>`
- Redux slices / selectors: `<existing slices this feature reads from or dispatches to>`
- Hooks: `<existing hooks composed in>`

**Primitives introduced** — every new type, component, slice, or hook this feature *added* to the platform. Each entry must justify why an existing primitive could not be extended.
- `<NewType>` (`<path>`) — Why a new type: <one-line justification>. Considered extending: `<existing-candidate>`. Rejected because: <one-line>.
- `<NewComponent>` (`<path>`) — Why a new component: <one-line>. Considered extending: `<existing-candidate>`. Rejected because: <one-line>.

If this list is empty: good. If it has more than two entries: re-read [PRINCIPLES.md](../../PRINCIPLES.md) before merging.

---

## Current work / migration state

If actively being rebuilt, what's the target and what's the current phase? Point at migration docs by path.

---

## Change log

Newest first. Each entry: date, author/agent, one-line summary. Keep under ~30 entries; archive older below.

- `YYYY-MM-DD` — <author>: <summary>

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log. Stale FEATURE.md cascades across parallel agents. Treat doc updates with the same weight as code changes in the same PR.
