# FEATURE.md — `applets-host`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-07`

---

## Purpose

The web host for Applets: `aimatrx.com/apps/<slug>` opens an Applet that lives only in the database
(`app.definition`) and renders it full-bleed through `@ai-matrx/applets`. No Applet code lives in this repo.

Cross-repo system of record: `common-docs/projects/applets/` (PLAN AP-0, CONTRACTS v2.2 §1, §2, §8).
Package mechanics: `aidream/apps/shared/applets/FEATURE.md`.

---

## Entry points

**Routes**
- `app/(link)/apps/[app]/layout.tsx` — MOUNTS the Applet (signed in + slug resolves), so it is never
  remounted when its page changes (a page under `[[...path]]` remounts per path; that rebuilt the host and
  re-read everything on every page change and on browser Back).
- `app/(link)/apps/[app]/[[...path]]/page.tsx` — renders nothing; signed-in only (signed-out →
  `/login?redirectTo=…`); resolves the slug (`resolve-applet-route.ts`, the viewer's server client — row
  security decides); a miss falls to `not-found.tsx`, which answers through `SlugAccessGate` (token `app`).

- `app/(core)/agent-apps/build/page.tsx` — **build by talking** (`?applet=<id>` changes an existing one):
  `builder/AppletBuilder.tsx`.

**Components**
- `AppletHostMount.tsx` — builds ONE `createPlatformHost` per Applet and renders
  `mountAppletAsync(record, host, HOST_SCOPE, { renderKind, renderRun, openRun })`.
- `AppletHostMount` props: `basePath`, `preview` (held writes, in-memory pages), `files` (unsaved buffers laid over
  the saved files — the code workspace's preview), `embedded` (a Space block: pages navigate in place, writes live;
  `features/agent-apps/embed/AppletInPage.tsx` passes it). Always binds `renderDataPage` → `features/agent-apps/embed/DataPage.tsx`
  (`<DataPage id>` inside an Applet), and declares the record's `mandates` in the top Agents menu
  (`useDeclaredSurfaceMandates`, `does` = the job's described goal) — no chips on the page. `/apps/<slug>` and `/p/<slug>` both mount it.
- `AppletForeignKind.tsx` — `renderKind` (`AppletKind`): a kind the app's registry routes renders through
  `KindInstanceRender`; a kind the APPLET's organization owns (read through `host.kinds` → `app.applet_kind`, so a
  viewer from another organization gets it too) compiles its stored web component with `compileStoredComponent`
  and renders it with `data={value}`; a build failure is captured (`foreign_kind_unbuilt`) and the shared floor shows.
- `AppletRunOutput.tsx` — `renderRun`: a job run through `LiveRunDisplay` (→ `MarkdownStream` → kind
  registry) keyed on the run's requestId; before/without an adopted request, the run's settled kind or error.

- `builder/AppletBuilder.tsx` + `builder/build-applet.ts` — one sentence → `readAppletCatalogue` (as the
  viewer) → mandate `applets.build` (`applets.fix` for Fix it) via `useHeadlessAgentJson`, the run streaming
  in the floating `LiveRunWindow` → the record saved as a draft (a change = UPDATE = new version) → preview
  through `AppletHostMount preview` (live reads, writes held by `holdWrites`, errors → Fix it) → "Use it"
  publishes.

---

## How the host is bound

| Port | Bound to |
|---|---|
| `supabase` | the browser client `@/utils/supabase/client` (the viewer's session) |
| `agents` | `createIntelligencePort({ transport })` over `createMatrxTransport(store.getState)`, wrapped by `adoptAppletRunStreams`: every `POST /ai/mandates/*` and conversation turn `POST /ai/conversations/<id>` (`useConversation`) body is teed — one branch to the agents port (`useJob` state), one to `adoptForeignStream` under the server's `X-Request-ID` (the execution system, so the run renders canonically) |
| `activeOrganizationId` | `selectActiveOrganizationId` at mount — reported to the frame; never narrows a read. The host is NOT rebuilt when it changes (a running job would die) |
| job organization | `@ai-matrx/applets` 0.3.0 decides for EVERY run (direct and Action): a member of the Applet's organization runs there; anyone else is answered by `resolveOrganization` (`ensureOrganizationContext` — the gate asks), null refuses `organization_required`. No wrapper around `host.intelligence.run` |
| `nav` | `go(to)` → `history.pushState` to `/apps/<slug><to>` (Next syncs `usePathname`; no server round trip, no remount); `current()` reads the URL; every URL change (incl. Back/Forward) is pushed to `subscribe` listeners. `hrefFor` gives every `<Link>` its real URL (`<basePath><to>`) |
| `reportError` | `captureError({ source: "applet" })` |
| `renderKind` | `AppletKind`: `KindInstanceRender` (the one kind pipeline, `variant="bare"`) for routable kinds; the Applet organization's own kinds through `host.kinds` + code-runtime |
| `renderRun` | `AppletRunOutput` — `<JobOutput job>` inline (CONTRACTS amendment 2.4) |
| `openRun` | `openLiveRunWindowAction` — the floating `LiveRunWindow`, one instance per (Applet, mandate) |

Scope: `react`, `lucide-react`, `@ai-matrx/design-system/controls`, `@ai-matrx/applets/react`, plus the
record's own `scope` (`{ entries, shadowDangerousGlobals }`); app-owned modules come from `lib/code-runtime/stored-scope.ts`.

---

## Invariants

- One canonical path: an Applet is a row, never a code registry. The old person-apps registry is deleted.
- Reads and writes run as the viewer; the host never picks an organization for a read.
- The surface `applets/<id>` follows the record: trigger `zzz_applet_surface_follows_record` on `app.definition`
  calls `ui.save_applet_surface` (AP-2's writer) on insert, rename, re-parent, archive and restore, carrying its
  values and Actions forward. Values and Actions are edited through the writer itself.
- Entity sources (`{ alias, entity }`) read and write platform records through `@ai-matrx/entity-data` inside the
  package host (applets >= 0.7.0); custom tables through `@ai-matrx/records`. One hook family over both.
- The host's surface is alchemy's `createSurfacePort` (applets >= 0.5.0); this mount binds `surfaces.live`
  to `liveValues`, so `surface.getValue` answers an unset name from the page's live capture.

---

## Change Log

- 2026-10-07 — The builder's answer is the kind `applet_build_result` (aidream `aidream/kinds/applets.py`; `applets.build` / `applets.fix` declare it): the "Building your app" window renders it through `AppletBuildResultBlock` (name + pages as they stream, the finished app in words, code behind "Show the code"). `coerceBuildAnswer` ignores `__kind`; Open stays on the builder card (the slug exists only after save). Conversation Applet rows use `<ConversationComposer>` (applets 0.7.6).
- 2026-10-07 — `files`, `embedded` and `renderDataPage`; the Applet's jobs are disclosed in the Agents menu; adopts applets 0.7.1, records 0.76.8, agents 0.48.0 (AP-0 lane A).
- 2026-10-07 — Conversation turns (`useConversation`, applets 0.7.x) are teed into the live-run pipeline like job starts.
- 2026-10-07 — `renderKind` is `AppletKind` (foreign kinds, PLAN AP-0 item 11); the Applet surface follows its record
  by trigger; entity sources documented (AP-0 lane A, contracts 2.5).
- 2026-10-06 — Created (AP-0, gate G1). Replaced `features/person-apps` (code registry + `PersonAppMount`
  + `holloway-content`) with the database-backed host; Holloway is now the `holloway-content` Applet row.
- 2026-10-06 — The Applet mounts in the route LAYOUT and navigates with `pushState`, so a page change or
  browser Back no longer remounts it (owner saw Back show the old page, then an empty shell, then content at ~10 s).
- 2026-10-07 — Binds `surfaces: { live: liveValues }` (applets 0.5.0, ALC-18): the Applet's SurfacePort is alchemy's.
- 2026-10-06 — Adopted `@ai-matrx/applets` 0.3.0 `resolveOrganization`; deleted the hand-made `host.intelligence.run` wrapper.
- 2026-10-06 — `@ai-matrx/applets` 0.4.0: job runs stream through the one live-run pipeline (`renderRun` /
  `openRun`, mandate streams adopted into the execution system).
- 2026-10-07 — Build by talking (AP-0 lane D, G5): `/agent-apps/build`, `AppletBuilder`, preview mode on `AppletHostMount` (held writes via `@ai-matrx/applets/preview`, in-memory pages, errors to Fix it); `basePath` prop (default `/apps/<slug>`).
- 2026-10-07 — Adopted `@ai-matrx/applets` 0.7.3: `hrefFor` on every Link; the code preview overlays the open unsaved file (`files`); the record's `scope` replaces `allowed_imports`/`component_code` (writers and DB readers rewritten).
