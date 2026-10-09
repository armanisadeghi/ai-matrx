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
  re-read everything on every page change and on browser Back). Every view at the address renders inside
  `AppletProviders.tsx` — the SHORT provider list a running Applet reaches, never the whole app's `Providers`
  (the `(link)` group layout carries none; each other link route takes `components/public-link/LinkProviders.tsx`).
  It reads the Applet's `app.definition` row on the server (`readAppletDefinition`, the viewer's own client) and
  hands it to the host as `definition`, so the first `record()` never waits for hydration to read again.
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
  publishes. **What she attaches** (lane A1): the box's "+" (`builder/BuildAttachments.tsx`) is /chat's attach
  sources (`ResourcePickerMenu`: files, notes, documents, pages, tables…) plus **Agent** (the ONE agent picker) and
  **Workflow** (`WorkflowListDropdown`). The list lives on the record (`metadata.build.references`,
  `builder/build-references.ts`, `saveBuildReferences` through the same guarded merge), so a reload keeps it and every
  round sends it: the material through THE attach path (`resources` on `runHeadlessAgentJson` / `continueAgentJson`,
  @ai-matrx/chat — a file by its file id, never her message), its names as the `attachments` context entry. An agent or
  workflow becomes a job of the Applet's organization (`builder/applet-job.ts`: `POST /mandates/soft` level
  organization + `PUT /mandates/<key>/default-holder`, key `applets.run_<name>_<id6>`, reused when attached again; the
  server's refusal is shown when she may not make one there or the organization cannot run it), and
  `readAppletCatalogue({ attachedJobs, describe })` lists it first with its real inputs. `builder/check-build-answer.ts` (`checkBuildAnswer`) + `builder/applet-code-checks.ts` are the
  refusal checks, loaded on demand with the frame: the code checks read the `@babel/parser` syntax tree, never
  regexes over the source.

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
- A stored Applet row may use a package export only once the DEPLOYED site has it. The deployed build carries the
  `@ai-matrx/*` versions locked at its `/api/version` commit, not the ones installed locally (2026-10-07: `WritingBox`,
  applets 0.8.0, broke 7 live Applets while live served 0.7.7). Before writing any row run
  `pnpm -s tsx scripts/applets/applet-render-sweep.ts --against-live`; it names every row that would break and exits 1.
  Self-test: `node scripts/applets/against-live.mjs --self-test`.

## Guest data (G2, 2026-10-09)

A signed-out visitor of a published Applet (`visitor` prop, the route's guest lane) reads and saves through the
GUEST client (`lib/guest/guest-supabase-client.ts`, its own cookie). Their first save (or job) makes the guest
(`lib/guest/ensure-guest-session.ts` → aidream `POST /auth/guest/session`); `@ai-matrx/applets` ≥ 0.18 then
makes their OWN copy of each table (keyed by Applet + alias, `app.applet_visitor_tables`) in the guest's
workspace. After the reminder knob (`applets.guest/saves_before_reminder`, 3) or at the ceiling
(`applets.guest/max_records`, 25) `AppletGuestKeepLine` shows the one account line with its button. Sign-up keeps
the same account; log in claims the workspace (`lib/guest/session-handover.ts`, see `utils/auth/FEATURE.md`).
The layout settles a pending claim on a signed-in load (`settlePendingGuestClaim`).

## Change Log

- 2026-10-09 (lane F14): the draft preview seeds a not-yet-made table with its declared example rows (`holdWrites(host.data, { seed })` in `AppletHostMount`, `@ai-matrx/applets` 0.18.9) - in memory only, saved on "Use it". The builder's "+" shows "Getting ready" until React has attached (a press before then reached no handler and did nothing). The builder agent's `ask_person` `payload` reached Gemini as a keyless object and arrived as `{}`; aidream now offers a free-form object as a JSON string. Kit 0.42.1 adopted (`resolveShortLinkPath`).

- 2026-10-09 (lane A1): the builder's "+" — files, notes, documents and pages reach the builder agent through THE attach path every round and persist on the build; her agents and workflows become the Applet's jobs (`applets.run_*`), listed in the catalogue with their real inputs. Tests: `builder/build-references.test.ts`; chat `a-turn-carries-what-the-person-attached.test.ts`; applets `src/catalogue/attached-jobs.test.ts`.

- 2026-10-09 (lane F12): a returning guest's account line shows on open (`@ai-matrx/applets` 0.18.2 fires `onGuestSaved` once on open); at the ceiling the line is the package's one sentence, kept in view (sticky).
- 2026-10-09 (lane F11): the saved card's new-table line wraps (the example count drops to its own line when narrow) and the Applet link shows in full (`break-all`; Copy was already the full link). A reload no longer breaks the build conversation panel: `@ai-matrx/rich-content` bare kind floor supplies its own content-IR provider (or text) and the host gate calls `use()` every render; guard `builder/build-conversation-reload.test.tsx`. `platform.knob_defaults` stays signed-in only (it returns the whole register); the cold read no longer leaves an unhandled rejection. New-table naming field is required by default and `rowLabel` is the one "Untitled" (`@ai-matrx/applets`).

- 2026-10-09 — G2 guest data: `visitor` mode on `AppletHostMount` (guest client, `ensureGuestSession`,
  `onGuestSaved`), `AppletGuestKeepLine`, pending-claim settle in the layout; adopts `@ai-matrx/applets` 0.18.0.

- 2026-10-09 (audit9 close-out): with @ai-matrx/applets 0.17.3 served, the builder's job-input check is back (`readJobInputs` → `checkBuildAnswer({ jobInputs })`), and each new table on the saved card shows "+ N from your example" for the sample rows declared in `new_table.rows` (`tablesToMake().examples`). F6b's one-conversation build landed with B13 updated: closing the run window never destroys the build's conversation.
- 2026-10-09 (lane F6b): A BUILD IS ONE CONVERSATION. The first run starts it on `applets.build`; the automatic fix round is a HOST turn on it (`fixHostTurn` → `host_turn`, never her words), and "Change it", "Fix it" and her replies are its next turns (`continueAgentJson`, @ai-matrx/chat; the record and `last_check` ride `context`). `applets.fix` is no longer used. The conversation is the first request's run (`buildConversationId` over `metadata.build.requests`); the left panel shows it through `AgentConversationDisplay` (read once per tab with `loadConversation`; closing a run window no longer destroys it). A reply sent while a round runs ("Send next") waits and is sent the moment the round ends. The agent (v5) takes her sentence as its user turn (catalogue/record/last_check in its system values), has `ask_person`, and its schema carries `new_table.rows`. Tests: `builder/build-conversation-f6b.test.ts`; chat `a-host-turn-continues-the-conversation.test.ts`.

- **2026-10-09 (lane F8)** — A finished run with no answer anywhere reads "This run finished without an answer." with **Run again** (`run-answer.ts`, `JobRunView.retry` from `@ai-matrx/applets` 0.17.3 when installed); the builder refuses an example seeded as a value (`examplesSeededAsValues`: a `useState` string its own placeholder offers). Stored Applets still seeded this way are listed in the lane F8 handoff (repair pending).
- 2026-10-09 (lane P1, open speed): measured on live, the open was all script loading — the page named 270 scripts
  (7.2 MB on the wire), 257 of them the whole app's `Providers`; hydration landed at 9–36 s, then the definition read
  (0.5–1.5 s) and the compile + first paint (< 0.5 s). `/applets/<slug>` now renders inside `AppletProviders`
  (meetings, messaging, sandboxes, cloud-file realtime/pickers, upload guard, task shortcuts, extension bridge,
  recovery, model catalog left out), and the row is read on the server and passed as `definition`
  (`@ai-matrx/applets` 0.17.2) — the client read that a held socket left on a skeleton is gone from the open.

- 2026-10-09 (lane F6, "Client Offer Breakdowns"): ONE live window per build — every run window of a build opens with `instanceId: applet-build:<id>` and a refused run's window closes before its fix round opens (two windows had overlapped). The fix round narrates in her words (`fixNarration`: "I found a problem with the created date field and I'm fixing it"); its history row reads "Fix the created date field" and the refused row "Problem found" (both read "Fixing"). The card says it is done and what each button does (`doneLine`, button titles) and shows the full link `https://<site>/applets/<slug>` with Copy through `@ai-matrx/kit/clipboard` (`appletLink`). The preview's held badge reads "N held in preview" with `heldHint`. `bannedIcons` refuses a generated Applet that imports lucide `Sparkles`/`Sparkle`/`WandSparkles` (emoji in her own data untouched). Server side (aidream `ac9a396f9f`): an out-of-range numeric tool argument is CLAMPED, never refused, and strict schemas carry stripped bounds in the description — the `ask_person timeout_seconds` refusal. Tests: `builder/build-page-f6.test.ts`.

- 2026-10-09 (lane F2, Applet audit): a failed run shows `run.error.message` — the visitor sentence `@ai-matrx/applets` 0.16 `forVisitor` gives it — never the stream's engineering line; a deleted or misconfigured job offers members of the Applet's organization "Fix this job" (→ Manage). A refused data READ (`announceRefusal(…, "read(<source>)")`) raises `AppletDataRefusedNotice` above the Applet — sign-in that returns here for a visitor, a plain sentence for a member — instead of a toast or a confident empty list. `/api/agent-context-menu` answers a request with no session an empty menu (was a 401 on every guest page). The kind fix-it bar no longer tells a signed-out visitor an `internal` kind is "not registered" (`unreadable` state, captured to the error inspector).

- 2026-10-09 — Lane F1 (typed input never reached the job): a FORM FILLS ITS OWN JOB. `jobRunNames` /
  `jobValuesNotTaken` (`builder/applet-code-checks.ts`) follow `useJob(alias).run(values)` through a literal, a
  `useState` state, a stock `FIELDS` list or an `onExecute` helper; `checkBuildAnswer` refuses any name the job
  does not take, with the job's input names read by `readJobInputs` (`@ai-matrx/applets/catalogue`, ≥0.15) for
  the catalogue's jobs and the Applet's own. Runtime twin: the package's `useJob` sends an extra box with her
  message and refuses a form none of whose names the job takes (applets 0.15.0).

- 2026-10-09 — Lane F3 (live UI audit, build page): "Use it" asks WHO can open it — My organization (default:
  `status` published, web switch off → `appletState` "In use") or Anyone with the link (the publication) — through
  `builder/UseAppletDialog.tsx` + `appletAudiencePatch`; Settings › Sharing carries the same choice plus People (the
  one `ShareButton`, token `app`). A refresh mid-build opens on the build: the page's server render reads the record
  (`toRecord`) and an open request is the step (`buildingStep`). One clock per request (`stepTo`). The run keeps its
  instance (`keepInstance`) and its window closes once the answer is saved — no blank "Done / Processing…" window over
  the preview. Files are said in her words (`plainFileLabel`), the card is titled with the Applet's name, taken
  addresses are skipped before the save (no 409), and a phone scrolls one column so the preview never covers
  "Use it" / "Open".
- 2026-10-09 — Lane F4 (live UI audit): a signed-out visitor at an archived Applet's address sees "This Applet is no
  longer available" and at an address naming none "There is no Applet at this address" (`AppletUnavailablePage`,
  `appletAddressFate` — one word, asked with the server key) instead of a sign-in wall; the maker of a running Applet
  gets `AppletOwnerBar` (Back to AI Matrx · Manage · Change with AI). Pairs with `@ai-matrx/applets` Unreleased
  (a ":id" page is never a tab; the reference stops promising a restore an Applet cannot offer).

- 2026-10-08 — Lane AQ: `checkBuildAnswer` refuses a form copied from a `useRow` row on every change
  (`useEffect(…set…, [row])` — a failed save rolled her typing back) and a confirm that says Delete / remove before
  `archive()` (an archive can be restored); both read the syntax tree (`formsReseededFromRow`, `archiveCalledDelete`),
  tested on the live social-planner page. Pairs with `@ai-matrx/applets` 0.14.0 (`useRow` hands out the stored row).

- 2026-10-08 — Lane AO: the builder card shows the Applet's description (what it IS, `SAVED_APPLET_COLUMNS` carries
  it) and a run's note only when that run was not a repair — a fix note ("Fixed import locations…") never stands
  in for the description; a repair answered without a description keeps the one the Applet had
  (`build-applet.description.test.ts`). The /applets list's About falls back to the description when no tagline
  was written. Adopts `@ai-matrx/applets` 0.13.0 (a refused save throws, so a generated form stays open) and
  `@ai-matrx/records` 0.87.14 (a blank email/url/phone saves as empty); the host's unhandled-rejection capture
  skips an already-announced refusal.
- 2026-10-08 — Lane AM: the build page's header re-reads the Applet's name after the first save (`router.refresh()`,
  was "Untitled Applet" until a reload); the preview line is one story — `previewLine(version)` "Preview of v2 · what
  you add here is held, never saved" (Draft/Published is the card's word only); `confirm()` waits up to 30 s for a
  mounted `<ConfirmDialogHost />` whose dynamic body is still loading (the first "Use it" press failed after 5 s).
  Record-form inputs (one vs many, link picker, long text) are fixed in `@ai-matrx/applets` 0.12.0.
- 2026-10-08 — Lane AL (refusals never block a valid Applet): the code checks moved to
  `builder/applet-code-checks.ts` and read the syntax tree (`@babel/parser`, now a dependency, ^8): a browser
  dialog is a real call of the global (`window.confirm(…)`, a bare `alert(…)` the file never imports or defines),
  never a word in a string, JSX text or a comment; a misspelled choice is a literal COMPARED with, WRITTEN to or
  an option VALUE of the field, never display text; a button is live under an `asChild` wrapper, in a form with
  `onSubmit`, as `type="submit"`, in a `<Link>`, or handed to a component as a prop; a hand-built table is
  refused only as a sortable record LIST (rows mapped one per `<tr>` under sortable-looking headers — a calendar
  grid or pivot passes); a field with no input counts only when written to the store. A file that does not
  parse is refused by name. `checkBuildAnswer` moved to `builder/check-build-answer.ts`, loaded on demand
  (never in the builder's first chunk). THE FIX CLAIM (`claimFixRound`, `fix_entry_id` on the refused entry):
  exactly one tab starts a refusal's automatic fix round, every other tab follows that run
  (`session.beginFix` / `session.follow`); reopening starts it only for a fresh, unclaimed refusal
  (`reopenOutcome`, `FIX_ROUND_FRESH_MS`) — an old one shows "Fix it" and spends nothing. Tests are behaviour
  pairs (`applet-code-checks.test.ts`, `build-session.test.ts`), no source-reading regexes.
- 2026-10-08 — Lane AI (the builder repairs its own output): EVERY refusal of her request goes to the ONE
  automatic fix round (`repairs`/`repairRefusal`) — a live run, a run rejoined after a refresh (the planner's
  first build sat on "Fix it" for five minutes there), and one found refused on reopen; only a refused fix
  round is shown. The fix button reads "Fix it to use it" on a draft (`fixLabel`), one button only. History
  reads a refused request saved by its fix round as "Fixed · Saved vN" (`requestOutcome`); the preview header
  no longer says "not saved" (`previewLine`). `checkBuildAnswer` refuses a hand-built `<table>` of rows (use
  `RecordTable`, applets 0.11.0 — headers sort and filter, links by label), a date bound to a plain text box
  (use `RecordField`/`DateField`), and a choice spelled in another case than the table's ("Assets Ready").

- 2026-10-08 — Lane AB (never publish broken, part 1): `checkBuildAnswer` refuses a browser dialog
  (`window.confirm`/`alert`/`prompt` → `confirmAction`) and a JSX string attribute carrying a literal `\n`;
  "Use it" is held while the preview reports any error (`publishBlockedBy`) and becomes "Fix it to use it".
  Tests: `builder/build-applet.never-broken.test.ts`. Part 2 (import check against the real exports via
  `appletImportProblems`, refused saves toasted via `announceRefusal`) lands with `@ai-matrx/applets` 0.10.0.

- 2026-10-08 — Lane AD (/applets/build hydration): the builder loads `AppletHostMount` (host + frame + Babel compiler)
  through ONE `next/dynamic` edge gated on a saved version, so the first screen no longer carries it (builder's own
  static graph 12.2 MB → 8.9 MB minified, esbuild metafile). Until the page hydrates, Build renders as a disabled
  "Getting ready" button with a spinner (never silently disabled); after, an empty box gives it a "Say what you want
  first" tooltip. Measured live: every (core) route loads ~270 scripts / ~24.5 MB decoded JS from the shell's merged
  client chunk group (Babel included); /applets/build added only 3 chunks / 653 KB of its own — the shell is the
  dominant hydration cost.

- 2026-10-08 — `AppletHostMount`: an open still pending after `OPENING_SLOW_MS` (20 s) shows "This Applet is slow to open" with
  Try again (a late answer still mounts; captured as `applet_open_slow`); a failed open renders through `ErrorNotice` with
  Try again. A gateway that never answered the definition read used to leave the skeleton up forever.
- 2026-10-08 — Lane AA: `checkBuildAnswer` also refuses a saved field no input sets (`fieldsWithNoInput` — the
  social planner's "Brand Requirements & Guidance" box wrote Guidance and Requirements stayed empty), a button that
  does nothing (`deadButtons`; inside a `<Link>` is fine), a declared new-table field no page shows and a new table
  nothing adds a row to (`newTableGaps`). A refused Build/Change gets ONE automatic `applets.fix` round before it is
  shown; a refused fix keeps "Fix it". The preview names the build's step and its seconds (`BuildStep`) from the
  moment Build is pressed — reading her tables and starting the run sat ~45 s on a bare placeholder.
- 2026-10-07 — Lane P: a claim whose tab died while saving is released after `STALE_CLAIM_MS` (90 s) and the next opener
  rejoins and saves (`claimed_at`, `isStaleClaim`, `releaseStaleClaim`); an unbuilt draft opens as its build from EVERY
  owner page (`manage/[id]/layout.tsx`, one redirect; `getApplet` is `cache`d per request); `appletSources` keeps
  `new_table` sources, so Settings never saves a draft without its pending tables; text typed into the builder's box before
  hydration reaches Build (ProTextarea/ProInput pre-hydration keep). Choices read back in the order declared
  (`custom.field_options` ORDER BY `option_position`). The builder runs on Gemini 3.8 Flash at low reasoning; the server's
  completed-turn replay no longer takes ~90 s on a 56 KB answer (aidream `kind_records`).
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
- 2026-10-07 — `applet-render-sweep.ts --against-live` (lane N): checks every row's `@ai-matrx` imports against the versions the deployed site's lockfile carries; self-tested red/green.
