# FEATURE.md — `applets-host`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-06`

---

## Purpose

The web host for Applets: `aimatrx.com/apps/<slug>` opens an Applet that lives only in the database
(`app.definition`) and renders it full-bleed through `@ai-matrx/applets`. No Applet code lives in this repo.

Cross-repo system of record: `common-docs/projects/applets/` (PLAN AP-0, CONTRACTS v2.2 §1, §2, §8).
Package mechanics: `aidream/apps/shared/applets/FEATURE.md`.

---

## Entry points

**Routes**
- `app/(link)/apps/[app]/[[...path]]/page.tsx` — signed-in only (signed-out → `/login?redirectTo=…`);
  resolves the slug against `app.definition` through the viewer's server client (row security decides);
  a miss falls to `not-found.tsx`, which answers through `SlugAccessGate` (token `app`).

**Components**
- `AppletHostMount.tsx` — builds ONE `createPlatformHost` per (Applet, active organization) and renders
  `mountAppletAsync(record, host, HOST_SCOPE, { renderKind })`.

---

## How the host is bound

| Port | Bound to |
|---|---|
| `supabase` | the browser client `@/utils/supabase/client` (the viewer's session) |
| `agents` | `createIntelligencePort({ transport: createMatrxTransport(store.getState) })` from `@ai-matrx/agents/intelligence` |
| `activeOrganizationId` | `selectActiveOrganizationId` at mount — reported to the frame; never narrows a read. The host is NOT rebuilt when it changes (a running job would die) |
| job organization | `host.intelligence.run` is wrapped: a member of the Applet's organization runs its jobs there (entity-bound, like a table write); anyone else uses the selected organization, and with none the organization gate asks (`ensureOrganizationContext`). The agents transport stamps that same organization |
| `nav` | Next router: `go(to)` → `/apps/<slug><to>`; `current()` reads the URL; route changes are pushed to `subscribe` listeners |
| `reportError` | `captureError({ source: "applet" })` |
| `renderKind` | `KindInstanceRender` (the one kind pipeline, `variant="bare"`) |

Scope: `react`, `lucide-react`, `@ai-matrx/design-system/controls`, `@ai-matrx/applets/react`, plus the
record's own `allowed_imports`; app-owned modules come from `lib/code-runtime/stored-scope.ts`.

---

## Invariants

- One canonical path: an Applet is a row, never a code registry. The old person-apps registry is deleted.
- Reads and writes run as the viewer; the host never picks an organization for a read.
- The surface `applets/<id>` is written by `ui.save_applet_surface` when the record is saved (AP-2 writer).

---

## Change Log

- 2026-10-06 — Created (AP-0, gate G1). Replaced `features/person-apps` (code registry + `PersonAppMount`
  + `holloway-content`) with the database-backed host; Holloway is now the `holloway-content` Applet row.
