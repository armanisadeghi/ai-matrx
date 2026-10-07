# FEATURE.md — `applets-host`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-07`

---

## Purpose

The web host for Applets: `aimatrx.com/applets/<slug>` opens an Applet that lives only in the database
(`app.definition`) and renders it full-bleed through `@ai-matrx/applets`. No Applet code lives in this repo.

Cross-repo system of record: `common-docs/projects/applets/` (PLAN AP-0, CONTRACTS v2.2 §1, §2, §8).
Package mechanics: `aidream/apps/shared/applets/FEATURE.md`.

---

## Entry points

**Routes**
- `app/(link)/applets/[slug]/layout.tsx` — MOUNTS the Applet whenever `resolveAppletView` says run, so it is never
  remounted when its page changes (a page under `[[...path]]` remounts per path; that rebuilt the host and
  re-read everything on every page change and on browser Back).
- `app/(link)/applets/[slug]/[[...path]]/page.tsx` — the Applet's ONE address. `resolveAppletView`
  (`resolve-applet-route.ts`, shared with the layout): a template → its introductory page; signed in → the running
  Applet; signed out + published public Applet (`get_aga_public_data`) → the running Applet on the guest lane plus
  the `MadeWithAiMatrx` row (`?embed=widget` drops it); signed out otherwise → the introductory page when the owner
  published one, else `/login?redirectTo=…`. An id-shaped address redirects to the slug. `/p/<slug>` was folded in
  and deleted. `build`/`manage`/`new` can never be a slug (`features/applets/reserved-slugs.ts`). Resolves the slug (`resolve-applet-route.ts`, the viewer's server client — row
  security decides); a miss falls to `not-found.tsx`, which answers through `SlugAccessGate` (token `app`).

- `app/(core)/applets/build/page.tsx` — **build by talking**; pressing Build moves the address to
  `app/(core)/applets/build/[id]/page.tsx` — ONE build at its own URL (`?applet=<id>` forwards there):
  `builder/AppletBuilder.tsx`. **A build is a record that survives a refresh** (`builder/build-session.ts` +
  `builder/useAppletBuildSession.ts`): the draft Applet row is born the moment Build is pressed, every request
  (text, run conversation id, outcome) is appended to `metadata.build.requests` through `mergeJsonColumn`, a
  reopen rejoins a still-open run through `loadConversation` + `reconnectServerOperation` and saves its answer
  from the conversation's committed text, and THE CLAIM (`claimBuildEntry`) saves each answer exactly once
  across tabs. The Applets list shows a running build as "building" and opens it at its build URL.

**Components**
- `AppletHostMount.tsx` — builds ONE `createPlatformHost` per Applet and renders
  `mountAppletAsync(record, host, HOST_SCOPE, { renderKind, renderRun, openRun })`.
- `AppletHostMount` props: `basePath`, `preview` (held writes, in-memory pages), `files` (unsaved buffers laid over
  the saved files — the code workspace's preview), `embedded` (a Space block: pages navigate in place, writes live;
  `features/applets/embed/AppletInPage.tsx` passes it). Always binds `renderDataPage` → `features/applets/embed/DataPage.tsx`
  (`<DataPage id>` inside an Applet), and declares the record's `mandates` in the top Agents menu
  (`useDeclaredSurfaceMandates`, `does` = the job's described goal) — no chips on the page. `/applets/<slug>` mounts it.
- `AppletForeignKind.tsx` — `renderKind` (`AppletKind`): a kind the app's registry routes renders through
  `KindInstanceRender`; a kind the APPLET's organization owns (read through `host.kinds` → `app.applet_kind`, so a
  viewer from another organization gets it too) compiles its stored web component with `compileStoredComponent`
  and renders it with `data={value}`; a build failure is captured (`foreign_kind_unbuilt`) and the shared floor shows.
- `AppletWritingBox.tsx` — `renderWritingBox`: every Applet box a person writes in is ProTextarea.
- `AppletRunOutput.tsx` — `renderRun`: a job run through `LiveRunDisplay` (→ `MarkdownStream` → kind
  registry) keyed on the run's requestId; before/without an adopted request, the run's settled kind or error.

- `builder/AppletBuilder.tsx` + `builder/build-applet.ts` — one sentence → `readAppletCatalogue` (as the
  viewer; the Applet organization's tables only) → mandate `applets.build` (`applets.fix` for Fix it) via `useHeadlessAgentJson`, the run streaming
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
| `nav` | `go(to)` → `history.pushState` to `/applets/<slug><to>` (Next syncs `usePathname`; no server round trip, no remount); `current()` reads the URL; every URL change (incl. Back/Forward) is pushed to `subscribe` listeners. `hrefFor` gives every `<Link>` its real URL (`<basePath><to>`) |
| `reportError` | `captureError({ source: "applet" })` |
| `renderKind` | `AppletKind`: `KindInstanceRender` (the one kind pipeline, `variant="bare"`) for routable kinds; the Applet organization's own kinds through `host.kinds` + code-runtime |
| `renderRun` | `AppletRunOutput` — `<JobOutput job>` inline (CONTRACTS amendment 2.4) |
| `renderWritingBox` | `AppletWritingBox` — the platform's ProTextarea (dictation, read-aloud, "…" actions) on the Applet's surface, for `<WritingBox>` and `<ConversationComposer>` (amendment 2.9) |
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

- 2026-10-07 — A build is a record with its own URL (lane G): `/applets/build/<id>` (the draft Applet, born at Build), request history in `metadata.build.requests` (`BuildHistory`), refresh/later visit rejoins the live run or saves the finished answer once (claim), the held-for-organization Build resumes with the pick (`ensureOrganizationForWrite`), the preview says "Saved vN", the list card shows "building". `saveBuiltApplet` no longer overwrites `metadata`; an empty draft claims the builder's slug on its first save.
- 2026-10-07 — THE BUILDER MAKES THE TABLES IT NEEDS (lane F, applets 0.9.1, CONTRACTS v2.10). An answer may declare
  `new_table` sources; `checkBuildAnswer` runs `checkAppletSources` (refuses a table of another organization than the
  Applet's, a broken declaration, or a new table repeating one she has) before saving; the card lists the tables "Use it"
  makes, the bound tables by name and organization (`features/applets/hooks/useSourceTableNames.ts`, linked to
  `/data/<id>`); the preview answers new tables empty with held writes; "Use it" (`publishApplet`) makes them through
  `makeNewTables` (records `ensureTable`, as her, in the Applet's organization), binds the record, then publishes.
  The catalogue offers only the Applet organization's tables. Overview names each source's real table, not its alias.

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
- 2026-10-07 — Build by talking (AP-0 lane D, G5): `/applets/build`, `AppletBuilder`, preview mode on `AppletHostMount` (held writes via `@ai-matrx/applets/preview`, in-memory pages, errors to Fix it); `basePath` prop (default `/applets/<slug>`).
- 2026-10-07 — Adopted `@ai-matrx/applets` 0.7.3: `hrefFor` on every Link; the code preview overlays the open unsaved file (`files`); the record's `scope` replaces `allowed_imports`/`component_code` (writers and DB readers rewritten).
- 2026-10-07 — Adopted `@ai-matrx/applets` 0.8.0: `renderWritingBox` → `AppletWritingBox` (ProTextarea), so `<WritingBox>` and `<ConversationComposer>` carry dictation and read-aloud.
- 2026-10-07 — "agent app" retired (lane A): the Applet runs at `/applets/<slug>` (was `/apps/<slug>`), the old
  `(public)/applets/[slug]` intro folded into the same route; owner tools at `/applets/manage/<id>/…`.
