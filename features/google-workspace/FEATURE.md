# Google Workspace

> **The whole-platform Google map** — the active first-party scope boundaries, approval waves,
> and non-OAuth lanes — is
> `/Users/armanisadeghi/code/common-docs/systems/integrations/provider-access/GOOGLE.md`.
> Read it before adding any Google capability anywhere.

> **The build plan for making Google native (three planes, primitives, build units):**
> `/Users/armanisadeghi/code/common-docs/projects/google-native/PLAN.md` (2026-09-17). The screens in
> this feature are rebuilt under it; the plumbing here is what it reuses.

## Purpose

This is AI Matrx's focused, reviewer-visible Google Workspace product surface. It proves the exact user actions behind the first direct Google OAuth verification campaign without exposing unrelated product features.

## Routes and entry points

- `/google-workspace-review` is the clean production reviewer route.
- `/user-settings/integrations/google-workspace` renders the same reusable workspace inside user settings.
- `GoogleWorkspaceReviewRoot.tsx` is the single provider boundary used by both routes.
- `GoogleWorkspaceConnectBody.tsx` owns the shared connect, account-selection,
  selected-file registration, Drive-import, Picker-broker, and reviewed-Gmail
  consent flow. `GoogleConnectWindow` supplies only WindowPanel chrome, so the
  same body can compose into the Workspace overview and settings surfaces.
- `GoogleWorkspaceOverviewBody.tsx` renders the same compact account inspector
  in Settings and the singleton window. It combines direct-RLS account/resource
  inventory with typed `GET /api/google-integrations/capabilities` metadata;
  product rollout, account permission, and selected-resource state stay distinct.

## Authorization contract

- Docs, Sheets, and Files import use `drive.file`, never an account-wide Drive scope. The user explicitly selects each item through Google Picker before AI Matrx can register, operate on, or import it.
- The browser Picker token is short-lived and memory-only. `drivePickerToken.ts` requests the
  `google_drive_picker` broker audience with one `connection:<uuid>` and exactly `drive.file`;
  aidream verifies connection ownership and refreshes the vault credential. Picker never relies on
  a second GIS popup or exposes the refresh token.
- The durable refresh token is encrypted in aidream's canonical user secrets vault and is never persisted in the browser.
- When GIS popup consent cannot be controlled, the shared connect panel offers an explicit same-tab redirect-code fallback. It uses the current registered origin as the callback, binds the request to a one-time HttpOnly `SameSite=Lax` state cookie plus bounded session metadata, and bypasses the root Supabase recovery-code redirect only while that cookie is present. The callback exchanges the code through the same aidream endpoint and scope contract and stores neither codes nor tokens in browser storage.
- Gmail is incremental and uses only `gmail.send`. The product cannot read, search, delete, or organize Gmail.
- Gmail sending requires visible recipients, subject, body, and an unchecked user confirmation immediately before the send action.
- Google Workspace content is not persisted by these endpoints and is not used to train generalized AI models.
- `/privacy-policy` affirmatively states that Google Workspace API data use adheres to the Google User Data Policy, including Limited Use requirements.

## Data and API flow

1. The browser receives an authorization code from Google Identity Services through the normal popup or the explicit same-tab redirect fallback; both paths request the same bounded scopes.
2. The browser sends that one-time code directly to aidream `/api/google-integrations/exchange` with the signed-in user's Supabase JWT.
3. aidream stores the refresh token in the canonical vault and safe connection metadata in `users.integration_connections`.
4. For Workspace operations, Google Picker returns one Doc/Sheet id. aidream validates it through `drive.file` and stores only safe metadata in `users.integration_connection_resources` as `google_document` or `google_spreadsheet`.
5. For Files import, Picker can return multiple explicit selections. The short-lived browser token downloads ordinary file bytes or exports supported native Workspace files; each becomes a browser `File` and immediately enters the canonical Matrx upload pipeline. Picker tokens and Google bytes are not persisted as a second file source.
6. Typed aidream `/api/google-workspace/*` endpoints read or update registered Docs/Sheets. Gmail sends only the exact reviewed payload.

## The agent half — `agent/`

The same capability, reached from a normal agent conversation instead of this
workspace. Two canonical tools, both offered on the `matrx-user/chat` surface
through the `google` tool bundle:

- **`google_workspace`** (server, aidream) — lists the user's selected Docs and
  Sheets, reads/appends a Doc, reads/writes a bounded Sheet range, and
  _prepares_ an email. It never sends.
- **`google_email_send`** (client-only) — `handlers/google-email-send.handler.ts`
  in `features/agents/ui-first-tools/` resolves the sending mailbox with
  `connection.ts`, then raises an `email_review` pending ask that
  `agent/GmailReviewCard.tsx` renders.

🚨 **`<GmailReviewCard>` IS the authorization.** It shows the sender, recipient,
cc, subject and body; every field is editable; the Send button posts exactly
what is on screen at that moment — never the agent's original arguments once the
user has changed them. There is no "always send", no pre-checked consent, and no
path that sends without a click; approval covers ONE message. On the server side
the tool has no executor binding at all, so an agent cannot assert consent even
in principle. Preview every state at `/demos/agent-cards`.

🚨 **THE CARD PARSES RECIPIENT FIELDS WITH THE ONE PARSER, AND REPORTS WHO GOOGLE
GOT.** Its Cc goes through `splitMailboxField` from `features/crm/gmail/mailbox.ts`
— quotes and angle brackets honoured — because it used to keep a private splitter
that cut on every comma, so `"Doe, John" <john@x.com>` reached the Send-time gate
as two unreadable pieces and the gate, which fails closed, refused the message in
words that blamed the person's own address. And `sendReviewedGmail` returns a
`ReviewedGmailSendOutcome`: the server answers the addresses its own parser
DELIVERED to (aidream lane B-10, `/projects/google-native/VERIFY-B1-B2-R2.md` N2),
the card resolves its ask with those, and the row the SERVER writes is therefore
filed against the Person who actually holds the address — `Ada Lovelace
<ada@example.com>` used to be judged as a string no Person holds. A server that
answers no addresses is older than that change: the typed field stands in and the
stand-in says so ON SCREEN. Guard:
`agent/the-card-sends-and-reports-real-addresses.test.tsx`.

🚨 **THE SERVER WRITES THE SENT RECORD, AND THIS CARD IS WHERE ITS ANSWER IS
SHOWN** (since 2026-09-17, aidream `4dbffdffb`). `POST /gmail/send-reviewed` gates
every recipient through the CRM's one send authority, sends, then writes the
`crm.interaction` row, its association edges and the `crm.sending_event` — so
`organization_id` is REQUIRED on the request (422 without it) and the record half
rides it. A caller with a record passes the `plan` prop, which the card calls with
the recipients on its own screen immediately before the post; a caller without one
(an agent emailing an address nobody in the CRM holds, the admin bench) passes
none and the transport resolves the viewer's own organization context through the
ONE fail-closed kernel. Whatever the answer reports — `record_failure`,
`sending_event_gap`, a refused association edge, a recipient warning — the card
says out loud, because it is on every send path and the message cannot be unsent.
A refused recipient is HTTP 409 `gmail_send_refused`: nothing was sent, and the
card renders the authority's sentence plus any block fix the sentence does not
already carry. The wire contract, and the two exact reasons `pnpm sync-types`
could not regenerate it, are in
`features/crm/gmail/reviewed-send-contract.ts`.

## The in-app half — `export/sendToGoogle.ts`

The ONE path any surface uses to push what the user is looking at into their own
Drive. `sendContentToGoogleDoc(content, title)` and
`sendRowsToGoogleSheet(rows, title)` resolve the user's last eligible Workspace
account choice, create the file, and return a link. **No surface owns Google
code of its own** — that is the whole point, and a second per-feature Google
client would be a defect.

Two wires carry it almost everywhere:

| Wire                                                                         | Reaches                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/content-actions/contentActionRegistry.ts` → "Send to Google Doc" | every `ContentActionBar` / `RichDocument` surface: the agent working-document panel, research outputs, transcripts, the Masterwork Record, … |
| `components/agent-copy/ExportMenu.tsx` → optional `sheetRows`                | every surface that already exports rows. `MatrxDataTable` passes it, so every canonical list page can send the view it is showing.           |

The Sheet's columns come from `rowsToRecordsFromColumns`, which shares the CSV
export's column selection and cell stringification — a user who downloads the
CSV and a user who sends the Sheet must get the SAME answer, and two independent
row builders is how those two answers start disagreeing.

**Not connected is a normal state, not an error.** Both entry points return a
typed `not_connected` result carrying the settings link, and every caller turns
it into a one-click "Connect" offer. Never render a failure there.

## Attaching a file to a message — `attach/` + the picker row

**Google is a row in the canonical attach menu** (`features/resource-manager/
resource-picker/`), shown to everyone — including users with nothing connected.
A user cannot ask for a capability they do not know exists, so the unconnected
state is the pitch plus a one-click connect, never an error and never a dead row.

**Connecting never leaves the page.** `useOpenGoogleConnectWindow()`
(`features/overlays/openers/googleConnectWindow.tsx`) raises
`GoogleConnectWindow`, a floating panel that connects, enables sending, and runs
Picker over whatever the user was doing. Call it from anywhere Google is needed.
It is NOT a second implementation — it calls the same `useConnectGoogle` and
`registerSelectedGoogleFile` the settings surface calls. Every authorization
action stays visibly disabled until Google Identity Services is ready; provider
readiness is never surfaced as a user error.

🚨 **An attached file travels as the reserved `__google_files` CONTEXT key, never
as a `content[]` resource block** (`attach/googleFileContext.ts`; the key must
stay byte-identical to the server's). The server side does two things at once —
names the files for the agent AND injects the Google tool for that turn, even
when the agent's configuration does not carry it. A content block would deliver
the first half and silently drop the second, leaving the agent able to name an
attachment it cannot open. Server half:
`aidream/services/google_workspace/attachments.py`.

## Docs Plane A/C — the Linked document as a record (`documents/`)

A Doc, Sheet or Drive file a person picked is ALSO a record: `workbench.google_document`
(aidream migration 0766, live 2026-09-17). `documents/` is its client half and it adds no
screen of its own — the record opens in THE Detail primitive, registered once in the
item-presentation type map (`itemType.tsx` → `features/item-presentation/registry.tsx`).

- `types.ts` — the row (from the generated database types) and the refresh response.
  🚨 The response interface is HAND-TYPED from aidream's `DocumentRecordResponse`
  (`aidream/api/routers/google_sync.py`) because the `google_sync` routes are not in
  `types/python-generated/api-types.ts` yet; when `pnpm sync-types` regenerates the contract
  that interface is DELETED and the generated one imported.
- `record.ts` — pure: the row → detail-row projection (the health producer looks for a
  `provider` column and the product whose grant refreshes the row, and this table names
  neither — it IS Google's; the CONNECTION is no longer projected, because since F-51 the
  producer reads this table's own `synced_via_connection_id`), the staleness rule, the freshness
  sentence, and the CURATED field list. Never `fieldsFromRow`: the generic formatter would
  print the whole cached document as a field.
- `appendBlock.ts` — the ONE composer of the exact block. The preview and the request are the
  same bytes; the heading is composed here because the client write route takes `text` and
  appends exactly that (only the AGENT path has a `dry_run`).
- `service.ts` — `POST /google-sync/documents/refresh` through `postGoogleBackend` (never a
  hand-rolled fetch), sending the RECORD's own `organization_id`; plus the one Supabase read
  of the row, used by the loader and after every refresh.
- `knobs.ts` — `google.refresh.on_open_min_age_seconds` (shared with the Agenda, seeded by
  lane U-W2) and `google.docs.append_heading` (seeded by
  `migrations/google_docs_append_heading_knob.sql`), both through `useEffectiveKnob`.
- `GoogleDocumentPanel.tsx` — the body read view, the four unavailable actions, the Append
  composer, and refresh-on-open.
- `refreshBus.ts` — the strip's Refresh and the panel are two components of one panel; a
  refresh announces itself so the body re-reads instead of the button appearing to do nothing.

🚨 **PLANE C IS TWO ROWS ON PURPOSE.** The picked-resource row
(`users.integration_connection_resources`) stays the authorization boundary for every
provider and the record REFERENCES it (`resource_id`, FK `ON DELETE RESTRICT`, unique per
`(organization_id, resource_id)` while live) — campaign Amendment A1, which supersedes PLAN
§4.1's earlier "the picked-resource registration row and this Record are ONE row". Never
collapse them, and never write a record without its resource row.

🚨 **THE STRIP TELLS THE TRUTH ABOUT THE FILE, NOT ONLY THE ACCOUNT.** Google answers 404 or
403 for a single file that was deleted, moved or un-shared while every other file on the same
grant keeps refreshing; the server records that on the row (`sync_status = 'unavailable'` with
its reason) and never deletes the record. So the registration wraps the generic health
producer: when the row says unavailable, the strip says so in the row's own words whatever the
account's health is, and the grant word becomes `unknown` rather than `revoked` — a reconnect
cannot repair a moved file. Of the four actions PLAN §4.1 names, Reconnect and Choose again are
real doors; Keep as Matrx data and Archive say "not wired up yet" in words, never as a disabled
button.

## Calendar Planes A/C — the agenda, and an event as a record (`calendar/`)

An owned Google Calendar event inside the agenda window is ALSO a record:
`communication.calendar_event` (aidream migration 0766, live 2026-09-17, certified). `calendar/`
is its client half and it adds no route of its own — the record opens in THE Detail primitive
(registered once, `itemType.tsx` → `features/item-presentation/registry.tsx`) and the agenda is
ONE component with three mounts.

- `types.ts` — the row (from the generated database types), Google's RSVP vocabulary, and the
  refresh response. 🚨 The response interface is HAND-TYPED (`*Pending`) from aidream's
  `CalendarRefreshResponse` because the `google_sync` routes are not in
  `types/python-generated/api-types.ts` yet; when `pnpm sync-types` regenerates the contract it
  is DELETED and the generated one imported.
- `record.ts` — pure, no clock of its own: the day grouping, the attendee reader, the freshness
  sentence, the staleness rule, the curated field list, the `google.calendar.agenda_days`
  parser, the Google Calendar door, and the four unavailable actions as sentences.
- `service.ts` — the FOUR doors, each the canonical one: the window read (React → Supabase,
  `mine` scope, through `readAllRows`), `POST /google-sync/calendar/refresh` through
  `postGoogleBackend`, the attendee → Person join over the SERVER's own edges, and create-note
  through `createNote` + `associationsService`.
- `useAgenda.ts` — the agenda as state: the knobs, the read, refresh-on-open-when-stale (once
  per account and window), refresh on demand, and the problems list. One clock read per pass.
- `AgendaPanel.tsx` — THE agenda. Mounted on the home screen
  (`features/dashboard/components/DashboardClient.tsx`), on the Person record through
  `PersonUpcomingCard.tsx` (`features/crm/components/record/PartyRecordPage.tsx`), and as the
  `googleAgendaWindow` panel, which wraps it `variant="bare"` and holds no calendar logic.
- `CalendarEventSections.tsx` — the detail's attendees section and the read-only section.

🚨 **THE DAY IS COMPUTED IN A NAMED ZONE, NEVER THE PROCESS'S.** `toISOString()` is UTC and the
host's "local" parts are whatever the machine is set to — a server render and the jest runner are
both UTC, so an 8pm New York event lands on tomorrow and no test catches it. Every day key goes
through `Intl` in an explicit IANA zone the caller passes (`dayKeyInZone`, `addDaysToKey`), and
an ALL-DAY row — a DATE Google stored as midnight UTC — is read in UTC, because reading it as an
instant files a Sep 25 holiday on Sep 24 in every negative-offset zone.

🚨 **THE LIVE COLUMNS ARE NOT THE PLAN'S WORDS.** PLAN §4.6 names `source_state`,
`last_refreshed_at` and `refreshed_via_account`; the table that was built spells them
`sync_status`, `synced_at` and `synced_via_connection_id`. Read the live column — and so does
the shared health strip, since F-51: it finds the connection in `synced_via_connection_id`
itself, so `calendarEventDetailRow` projects only what the row genuinely does not say (which
connector product's grant refreshes it). Never re-add a `connection_id` alias.

🚨 **THE AGENDA REFRESHES THROUGH THE ACCOUNT THAT HOLDS CALENDAR.** `useAgenda` asks
`preferredAccountId` with `forProductKey: CALENDAR_PRODUCT_KEY`. Without it the ranking returns
whichever connected account holds the MOST products, and with Calendar on one account and five
other products on another the panel read Calendar's health on the wrong one, said the calendar
was not connected, and the doomed-call gate then correctly refused to refresh (F-51). Any new
single-product surface names its product the same way.

🚨 **THE SERVER MATCHES ATTENDEES TO PEOPLE; THE CLIENT NEVER RE-MATCHES.**
`refresh_calendar` resolves each attendee email against `crm.contact_medium.value_key` and
writes a `calendar_event → party` edge with role `attendee`. The client reads the EDGES. It asks
`crm.party_contact_point` which address a linked Person holds only to decide which RSVP dot the
door belongs beside — membership is the edge, and a Person whose stored address is no longer on
the event still gets their door.

🚨 **THE NOTE EDGE IS WRITTEN `calendar_event → note`, role `about`.** PLAN §4.6 writes it the
other way round; the one chokepoint types its TARGET against `ASSOCIATION_TARGET_TYPES`, a
curated list in `@ai-matrx/associations` that does not carry `calendar_event`. The role, the
pair and the meaning are the plan's — only the row's direction differs, and it matches the
direction the server already uses for this table. The People edges are `note → party`, which
that union does carry. Widening it is a package change (THE SAME-SESSION LAW).

## Invariants

- 🚨 **THE FILE TYPES ARE DECLARED ONCE — `resource-types.ts`.**
  `GOOGLE_WORKSPACE_FILE_TYPES` is the ONE record of every file type a person can
  pick through Google Picker, and it carries everything a surface needs to draw
  one: the person-facing label, the Lucide icon and its accent, the door at
  Google (`hrefFor`), which read THIS CLIENT has (`clientRead`), whether it can
  be written (`writable`), and the honest sentence to show when it cannot be read
  here (`readOnlyNote`). Every list filter goes through `isGoogleWorkspaceFileRow`
  (declared once, in `features/marketing/google/types.ts`, beside the row type);
  every icon, name, door and detail comes from the record. **Never a hand-typed
  `"google_document" | "google_spreadsheet"` and never `isSheet: boolean`** — a
  boolean cannot say "Slides deck". A file type whose `clientRead` is `null` NEVER
  falls through to another type's reader: the old `if (Doc) … else sheet` asked
  the Sheets API for a presentation id and showed Google's error as though the
  person's deck were broken. Guards: `features/connectors/__tests__/capability-keys-are-the-servers-keys.test.ts`
  censuses the record against the server's own `eligible_resource_types` and
  `ResourceType` union in the sibling aidream checkout (UNMEASURED, out loud, when
  that checkout is absent), and `a-connected-deck-has-a-row-and-a-door.test.tsx`
  proves a `google_presentation` row is listed by name, opens, and gets an honest
  read-only detail. Why: `slides` has been an `available` capability with
  `eligible_resource_types = ("google_presentation",)` and a live successful
  `slides.read` call, while six hand-typed pairs in this repo had never heard of
  it — so a picked deck was accepted by the attach call and then had no row, no
  name and no door, and `connectionResource` THREW on the row, emptying every
  Google surface in the app (V13-3).
- 🚨 **A WRITE MAY COME BACK AS A PROPOSAL, AND EVERY CALLER SAYS SO.** The four
  direct write calls in `service.ts` — `documents/create`, `sheets/create`,
  `documents/append`, `sheets/write` — return `GoogleWriteOutcome<T>`: either the
  written file, or `{proposed: true, assistId, mode}` when the server answered
  HTTP 202 because the organization's autonomy mode for that capability
  (`hitl.google.attended_file_write`) asks a person to review it first. The server
  writes NOTHING in that case and files the change in THE approval queue. A caller
  says `SENT_FOR_APPROVAL_MESSAGE` and opens `approvalQueueHref(assistId)` — never
  "Created", and never "Connect Google", which is what every caller said before
  the union existed. A 202 that does not name the approval is REFUSED with its
  remedy: the change may be queued or may not exist, and only the queue can say.
  The one adapter is `writeOutcome`; the guard is `write-gate.test.ts`. Why it
  exists: `gate_mutating_action` wraps the AGENT tool dispatch table only, so
  until 2026-09-17 that knob governed the agent path and a person's own click
  ignored it entirely — a knob that governs nothing (round-2 hostile
  verification, common-docs
  `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-vii).
- The Settings and window overview share one compact account inspector. An
  explicit requested account that is unavailable stays unavailable until the
  user chooses another reachable account; ordinary no-target inspection may
  start with the first reachable account.
- The capability catalog renders every typed descriptor, including unavailable
  and internal-test entries. It reports rollout admission, healthy account
  permission, and selected resources separately; it never offers selective
  consent or assignment controls before their contracts exist.
- **Account-scoped work never silently takes the first connection.** Distinct
  Google identities remain explicit choices in Chat attachments, Picker,
  Drive import, Workspace management, and reviewed Gmail sending. The browser
  remembers separate Workspace and Gmail-send connection UUIDs only; tokens
  remain memory-only or in aidream's vault. A missing/disconnected preference
  falls back to an eligible account without hiding the selector.
- Product pickers filter the RLS-visible inventory to connections owned by the
  signed-in user or one of their organizations before capability selection.
  Super-admin visibility must never make another user's credential appear as a
  selectable Google account; broker ownership remains the final enforcement.
- File and email verification controls are collapsed under **Test the file
  connection** and **Test the email connection**. They prove the grants; they
  are not the page's primary account-management workflow.
- No Drive list or search endpoint exists in the service, and no agent tool
  accepts a `connection_id` — reach always resolves from a registered
  Picker-selected resource.
- Files import can copy ordinary Drive files plus Docs, Sheets, Slides,
  Drawings, and Apps Script projects selected in Picker. Forms, Vids, folders,
  shortcuts, owner-disabled downloads, and native exports over Google's 10 MB
  export limit remain actionable refusals; no broad Drive listing is added.
- No Gmail read scope or endpoint exists in this feature.
- No file content or email body is stored by the Workspace service.
- **A range without a tab name targets the spreadsheet's first tab.** The UI
  defaults to `A1:C10`; never assume a selected spreadsheet contains `Sheet1`.
  Backend 4xx input errors stay in the page's actionable alert and do not emit a
  duplicate captured error toast; server failures remain loud.
- Re-consent for Gmail must preserve existing Picker-selected resource rows.
- Marketing scopes are not bundled into the reviewer workflow.
- The dedicated reviewer route prepopulates Picker with the review-fixture query so unrelated Drive file names do not appear in the verification video. The normal Settings surface remains unfiltered.
- Every selected Doc or Sheet exposes an **Open in Google** new-tab door so users and reviewers can verify source-account changes without losing the AI Matrx workflow.
- The frontend and backend canonical scope registries must remain aligned with `common-docs/projects/google-oauth-verification/PLAN.md`.

## Change log

- `2026-09-18` — **F-51: the projections are gone and Calendar's account is chosen by the product.** `googleDocumentDetailRow` / `calendarEventDetailRow` no longer rename `synced_via_connection_id` to `connection_id` — the shared producer (`features/item-presentation/sourceHealth.ts`) reads the live column, so a registration projects only what its row genuinely does not say. `useAgenda` now names its product when it asks for an account (`forProductKey`), so the agenda stops reading Calendar's health on whichever account holds the most other products. Red-then-green: `calendar/__tests__/the-refresh-runs-through-the-account-that-holds-calendar.test.tsx` (3 cases, real health derivation, bigger account listed first) and `features/item-presentation/__tests__/the-strip-reads-the-connection-the-row-names.test.ts`. Calendar and Tasks also got their first useful action in the consent dialog (`features/connectors/provider-config.ts`). No screen was seen.

- 2026-09-18 — **B-29: the last two of the four unavailable actions are real.** "Keep as AI Matrx
  data" and "Archive this record" were honest words ("not wired up yet") because the server had no
  door. Both are calls now, to ONE generic server pair that serves every synced record table
  (`POST /google-sync/records/{table}/{id}/detach` and `.../archive` — aidream
  `services/google_sync/FEATURE.md`), so the calendar panel adopts them by passing
  `communication.calendar_event` to the same two functions. Client: `documents/service.ts` gains
  `detachSyncedRecord` / `archiveSyncedRecord` (the record's own `organization_id`, the one
  authenticated transport, the status word refused by name when the server says something this
  screen does not know); `documents/types.ts` gains the terminal word `detached` and the response
  shape, hand-typed from the named source; `GoogleDocumentPanel` asks first through
  `<ConfirmDialog />` (`confirm()`), and each question NAMES the consequence — what stops, what is
  kept, that nothing changes in Google, and for Keep that it cannot be undone from there; a
  detached record gets its own notice (no Keep, no re-pick links, Archive still offered) and no
  longer refreshes on open; `documents/itemType.tsx` makes the health strip state the choice with
  `grant: "ok"` and offers NEITHER Refresh nor Reconnect on a detached record, because a Refresh
  would be refused with a 409 and a Reconnect repairs nothing. 5 new tests (45 in
  `documents/__tests__`), each proven red first: a generic "Are you sure?", the wrong record id,
  and a detached record refreshing on open each turn a named test red. U-W1's assertion that two
  actions are words was updated in the same commit — it is now "none of the four says `not wired up
  yet`". Owed: `pnpm sync-types` (the response is still hand-typed with its generator named), and
  no screen has been seen — the table holds zero rows, so a person must pick a Doc first.

- 2026-09-18 — **U-W2: Calendar Planes A/C — the agenda, and an event that opens in place.** New
  `calendar/` (above). `communication.calendar_event` joins THE item-presentation type map, so an
  event opens as a window, a docked panel or `/detail/calendar_event/<id>` from one registration,
  with curated fields, the health strip, the attendees (RSVP state, a door and open-deal count
  for every attendee who is a Person here) and the four things a read-only grant cannot do,
  stated as sentences with nothing to press. ONE `AgendaPanel` is mounted on the home screen, on
  the Person record ("Upcoming with <name>", filtered to that record's own addresses, absent when
  it has none) and as the `googleAgendaWindow` panel. Refresh on open only when the newest row is
  older than `google.refresh.on_open_min_age_seconds` — read through the SHARED reader beside the
  Docs record, not a second parser — plus refresh on demand, with "Refreshed N minutes ago from
  Google" always on screen. `migrations/google_calendar_agenda_knobs.sql` seeds
  `google.calendar.agenda_days` (7, max 31 — the max is the provider bound: the server refuses a
  window outside 1..31) and the shared refresh floor (300); neither row is live yet, and until the
  chair applies the file the surface says the window is the platform's default rather than an
  administrator's choice. Red-then-green by mutation, five suites / 46 assertions: removing the
  registry entry fails every presentation assertion; falling back to the generic field formatter
  prints `__kind` and the whole attendee jsonb onto the screen; dropping the read-only section
  fails; refreshing on open regardless of staleness, rendering an unreadable agenda as an empty
  day, and replacing the ONE connector prompt card with a card of our own each fail by name;
  reading an all-day row in the viewer's zone and grouping in UTC while a zone was passed fail in
  America/New_York and Asia/Tokyo; and reading a knob that has no row as a ONE-DAY agenda
  (`Number(null) === 0`) fails. Not verified on a screen: no browser can reach this environment,
  and `communication.calendar_event` holds zero rows live.
- 2026-09-18 — **U-W1: Docs Plane A/C — the Linked document opens as a record.** New
  `documents/` (above): `workbench.google_document` is registered as an item type, so a
  connected Doc opens in the Detail primitive in all three presentations with curated fields,
  the cached body, the associations and history sections, a health strip whose subject is the
  ACCOUNT's grant **and** this file's own `sync_status`, the four unavailable actions
  (two real doors, two honest "not wired up yet" lines — never a disabled button), refresh on
  open when `synced_at` is older than `google.refresh.on_open_min_age_seconds` and on demand
  through the strip, and the Append composer that shows the exact block before it lands.
  Red-then-green, four suites / 40 assertions: with the registry entry removed 9 of 10
  registration assertions fail; with the strip taking only the product-level answer the
  unavailable-file assertion fails; with the heading added after the preview the exact-bytes
  assertions fail. Two real defects the tests caught in our own code: `Number(null)` is `0`, so
  a missing knob row became a zero-second refresh floor (one Google call per record opened, for
  every organization, silently); and the refresh sent no organization, which the server refuses
  with 422 — it now sends the RECORD's `organization_id`. Not done here and named: the client
  append route has no `dry_run` (the preview is exact because the client composes the heading),
  and the two "not wired up yet" actions need a server half.

- `2026-09-17` — **F-37: the reviewed send carries the record, and the server
  writes it.** `sendReviewedGmail` now posts the whole reviewed-send contract
  (required `organization_id`, the party/deal/project/contact-point/medium/list/
  identity fields, `cc_attribution`, `account_email` and the drafted-by hints) and
  returns the narrowed `ReviewedGmailSendOutcome` — the row, the edges, the
  sending event, the compliance envelope and the warnings the server reported.
  `ReviewedGmailDraft` gained a required `context`; `ReviewedGmailReceipt` is gone
  (no legacy). `GmailReviewCard` gained a `plan` prop (the record context, decided
  from its own recipients at the click), raises every gap the answer names, and
  renders the 409 `gmail_send_refused` sentence with its block fixes over a send
  that never happened. The organization is the record's own, or — for a send with
  no record — the viewer's context through `requireOrganizationContext`, the same
  value `postGoogleBackend` puts in the org-context header, so body and header can
  never disagree. The shape lives in `features/crm/gmail/reviewed-send-contract.ts`
  because `pnpm sync-types` cannot run without database environment (its header
  carries both exact errors) and a generated file is never hand-edited; a
  cross-repo census test measures every field against the server's Pydantic
  models. Guards: four new cases in
  `agent/the-card-sends-and-reports-real-addresses.test.tsx` (the record failure
  and the sending-event gap reaching the person, a refused edge and a warning as
  their own sentences, an unattributed recipient sending NO record fields, a
  delivered/filed address disagreement) plus two for the 409, each proven red by
  swallowing the notices and the refusal; `npx jest features/crm/gmail
  features/approvals features/google-workspace` = 38 suites / 297 tests green.
- `2026-09-17` — **The Picker now OFFERS every file type the buttons name (Bugbot
  round 21 on PR 228).** Deriving the button copy from the record fixed the words
  and left the door shut: `lib/googlePicker.ts` carried its own pair of MIME
  types, its own title and its own post-pick refusal, so "Choose Docs, Sheets or
  Slides decks" opened a Picker that filtered decks out — a screen promising what
  it then refuses. Each record entry now carries Google's `mimeType`, and the
  Picker's `setMimeTypes` filter, its title, its refusal sentence, the pick-button
  label and the "Picker can access only …" sentence beside it are all built from
  it; `PickedGoogleFile` carries the resolved `resourceType` instead of a narrowed
  MIME union, and `googleWorkspaceTypeForMime` mirrors the server's
  `_resource_type_for_mime`. Guard: `the-picker-offers-every-file-type-it-names.test.ts`
  drives the real `pickGoogleWorkspaceFile` against a stubbed Google Picker and
  reads back what it asked Google for (red against the old hardcoded pair), and
  the deck render test asserts every type's plural appears in the rendered copy.
  **The full pick round-trip completes once B-18 lands the server half** — today
  `/files/register` still 500s on a deck because `aidream/api/routers/google_workspace.py`'s
  `SelectedFileResponse.resource_type` is narrowed to Docs and Sheets while the
  service's own `ResourceType` is the triple.
- `2026-09-17` — **A Slides deck a person picks now has a row, a name, a door and
  an honest detail (V13-3, client half).** The file types moved into ONE record,
  `resource-types.ts`, and the six hand-typed `google_document |
  google_spreadsheet` pairs were replaced by it: the review workspace's list
  filter, icon, kind label and door; the connect body's connected-files list and
  its pick-button copy (derived, so a new type cannot leave "Choose a Doc or
  Sheet" behind); the chat resource picker's list, icon and its `isSheet: boolean`
  handoff (now the real `resourceType`); `service.ts`'s registered-file guard;
  `GoogleWorkspaceOverviewBody`'s door builder; and — the sharpest one —
  `features/marketing/google/service.ts`'s `connectionResource`, which threw on a
  deck and so took the WHOLE inventory read (accounts, properties, channels,
  files) down with it. A file type with no client reader gets a read-only detail
  that shows only facts the row really holds (name, kind, last edited in Google,
  how it entered, when it was connected) plus **Open in Google**, and its Read
  button now refuses by name instead of calling the Sheets API with a
  presentation id. The door on a file row is no longer conditional on a stored
  `web_view_link` — the type's canonical URL always exists.

- `2026-09-17` — **one recipient parser, and the reviewed send says who it
  reached** (lane F-25, closing the seam F-20 flagged plus aidream lane B-10's
  N2). `GmailReviewCard`'s private `parseAddressList` is DELETED: it split Cc on
  every comma, so `"Doe, John" <john@x.com>` arrived at the Send-time gate as
  `"Doe` and `John" <john@x.com>`, the gate could read neither, and — failing
  closed, correctly — it refused the send with "\"Doe\" is not an email address
  this can read". The card now uses `splitMailboxField` from
  `features/crm/gmail/mailbox.ts`, the ONE parser, and a genuinely unreadable
  field still refuses: the parse got better, not laxer. And `sendReviewedGmail`
  returns the narrowed outcome (`messageId` + the `to`/`cc` the server's own
  parser delivered to, `null` from an older server; since F-37 the whole sent
  record with it) which the card reports in its ask, so the sent record, its
  contact point, its Cc attribution and its metadata are all judged against what
  Google got rather than what was typed;
  `GoogleWorkspaceReviewWorkspace`'s toast names the delivered address too. Guard:
  `agent/the-card-sends-and-reports-real-addresses.test.tsx` (5 cases, red first —
  the RED was the refusal sentence above).

- `2026-09-17` — **the autonomy knob now reaches a person's own Google writes**
  (lane F-14, round-2 verification § A-vii). `service.ts`'s four write calls
  return a `GoogleWriteOutcome` union through one adapter, and every caller reads
  it: `GoogleWorkspaceReviewWorkspace` (append + sheet write), both
  `export/sendToGoogle.ts` exports (new result variant `reason: "proposed"`,
  carrying the queue href), and the four surfaces downstream of those —
  `components/agent-copy/useExportActions.ts`,
  `components/content-actions/contentActionRegistry.ts`,
  `components/mardown-display/tables/SendToGoogleSheetButton.tsx` and the message
  options registry. `features/approvals/mode.ts`, the dead client-side mode
  ladder, was deleted in the same commit: the server resolves the mode. Guard:
  `write-gate.test.ts` (11 cases, all proven red against the pre-fix bytes).
  Unverified in a browser — every route on this branch answers 500 on an
  unrelated missing manifest.

- `2026-09-17` — **Google is now the first PROVIDER CONFIG of the connector
  primitive, not a set of Google-only surfaces.** The nine approved products, each
  with its final one-sentence promise, its grant bundle and the server capability
  keys it covers, are declared once in
  [`features/connectors/provider-config.ts`](../connectors/provider-config.ts);
  the card, the "Choose what to connect" dialog, the per-capability health rows
  and Settings → Connectors are generic components that render whatever provider
  they are handed, and `features/connectors/google-adapter.ts` is the only file in
  that path allowed to name Google. It consumes what already existed here and in
  `features/marketing/google` rather than duplicating it: the auth-gated inventory
  query, `diagnoseGoogleConnection`, the typed capability catalog, the GIS code
  client and `useConnectGoogle`. `connectGoogle` gained the `google_products`
  connection purpose and a `capability_keys` option so one button can turn on
  several products in one exchange (the aidream half is lane U-P8; until it is
  deployed the dialog says so in plain words and changes nothing). Local mechanics
  and the invariants: [`features/connectors/FEATURE.md`](../connectors/FEATURE.md).
  The three status-only Google cards in Settings
  (`features/connectors/DirectoryConnectorCards.tsx`) are deleted — the health
  rows replace them. `GoogleWorkspaceConnectBody` is untouched and remains the
  Docs/Sheets picker flow.
- 2026-09-15: Added the shared Google overview and typed capability catalog to
  Settings and the singleton connect window. The inspector preserves exact
  account selection, keeps unavailable requested accounts explicit, and routes
  only existing Workspace or Marketing management actions.
- 2026-09-15: Moved the shared Google connect/select/import body and state from
  `GoogleConnectWindow` into `GoogleWorkspaceConnectBody`; the window is now a
  thin WindowPanel composition and no OAuth, Picker, broker, Vault, callback,
  or Gmail-consent behavior changed.
- 2026-09-01: Distinguished the state-bound Google root callback from Supabase recovery codes in the shared proxy, so same-tab consent reaches its verifier instead of being misrouted to `/auth/callback`.
- 2026-09-01: Added a secure same-tab GIS redirect-code fallback for browser environments that cannot control Google's consent popup. The exact registered origin callback validates one-time server and session state, then converges on the canonical aidream exchange without broadening scopes or persisting credentials in the browser.
- 2026-09-01: Gated every Google connect and incremental-consent action on GIS readiness so an
  immediate click opens no red error toast while the shared script is still loading.
- 2026-09-01: Filtered the shared Google UI inventory by caller reachability so
  super-admin visibility cannot route Files import, Chat attachments, exports,
  or reviewed Gmail through another user's otherwise eligible credential.
- 2026-09-01: Routed Picker and Drive import through the connection-bound token broker audience,
  eliminating the second browser OAuth popup that could silently return no token in isolated
  sessions while preserving the exact `drive.file` boundary.
- 2026-08-28: Replaced first-row Google account resolution with one reusable
  identity selector and separate remembered Workspace/Gmail choices. Chat
  attachments and Picker resources now stay scoped to the account shown;
  Drive import, settings, exports, and reviewed Gmail reuse the same choices.
- 2026-08-28: Added selected-file Google Drive import to the canonical Files
  acquisition control. Connected users see **Import from Google Drive**;
  unconnected users see **Connect Google Drive** in the same slot. Multi-select
  Picker results materialize in-browser (`files.get?alt=media` for blobs,
  `files.export` for supported Workspace types) and then use the existing Matrx
  upload pipeline; the OAuth scope and durable server resource model did not
  broaden.
- 2026-08-22: `SendToGoogleResult` gained a `failed` variant — `sendToGoogle`
  now catches server refusals (typically an expired grant needing reconnect)
  and returns the server's user-facing message instead of leaking an exception;
  all four consumers surface it as an error toast. Added the "Google Sheet"
  sibling to the "Workbook" button on markdown tables
  (`components/mardown-display/tables/SendToGoogleSheetButton.tsx`), closing
  the export-target gap named in `docs/handoffs/google-workspace-deeper-integrations.md` §2.
- 2026-08-18: Reworked the settings/reviewer workspace around a compact
  connected-account permission/status table, concise policy copy, per-account
  management, and collapsed file/email connection tests. Repeated Picker opens
  reuse the same account's still-valid in-memory token, avoiding redundant
  OAuth popup flashes while keeping first-use authorization explicit.
- 2026-08-18: Removed the `Sheet1` assumption from the Sheet range default,
  trimmed submitted A1 ranges, and kept backend input errors inline instead of
  filing a duplicate `user-toast` error.
- 2026-08-18: Added the attach half — Google in the canonical resource picker
  (always offered), the connect-anywhere `GoogleConnectWindow`, and the
  `__google_files` context key that carries attached files to the agent along
  with the tool to open them.
- 2026-08-18: Added the in-app half — `export/sendToGoogle.ts`, "Send to Google
  Doc" on the shared content-action registry, and an optional Google Sheet
  destination on `ExportMenu` (passed by `MatrxDataTable`, so every canonical
  list page gains it). Promoted the connection resolver out of `agent/` since
  both halves use it. Verified in the browser: the destination renders on a real
  list page, runs, and offers Connect when no Google account is linked.
- 2026-08-18: Added the agent half — the client-only `google_email_send` tool
  and `<GmailReviewCard>`, the surface that turns an agent-proposed message into
  a user-confirmed send. Added it to the `/demos/agent-cards` gallery.
- 2026-08-13: Made each selected Doc/Sheet's external-link indicator a real **Open in Google** action for reviewer source-account verification.
- 2026-08-13: Added Google's required affirmative Limited Use compliance statement to the public privacy policy.
- 2026-08-07: Prepopulated Google Picker only on the dedicated reviewer route so verification recordings show the named review fixtures without exposing unrelated Drive file names.
- 2026-08-06: Added the focused reviewer route, in-product disclosures, selected Doc/Sheet Picker flow, bounded read/update actions, incremental reviewed Gmail send, and explicit disconnect control.
