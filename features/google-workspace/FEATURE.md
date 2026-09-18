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
- 🚨 **NO SURFACE HERE READS OR WRITES A GOOGLE DOC.** Since F-58 (2026-09-18) every
  picked-resource list — `GoogleWorkspaceReviewWorkspace.tsx`,
  `GoogleWorkspaceConnectBody.tsx`, `GoogleWorkspaceOverviewBody.tsx` — offers a Doc or Sheet
  exactly one in-app action: **open it as its Record** in the Detail primitive, through
  `documents/openRecord.tsx`. The bench keeps only the bounded Sheets A1-range read/write
  (there is no canonical range surface yet) and the reviewed-Gmail send.
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
  Both tools answer with a registered Shape — `google_workspace_result` and
  `google_marketing_result` — and each has exactly ONE component:
  [`components/mardown-display/blocks/google-kinds/`](../../components/mardown-display/blocks/google-kinds/)
  (`GoogleWorkspaceResultBlock.tsx` / `GoogleMarketingResultBlock.tsx`), routed by that
  kind's `content_ir.kind_component` row. Never render a Google tool result any
  other way: a dry-run preview read as a receipt, or a capped marketing window
  read as a total, is the defect those components exist to prevent.
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
  of the row, used by the loader and after every refresh. 🚨 **Every wire-contract assertion
  in it throws ONE type, `GoogleWireContractError`**: the message is the plain sentence a
  person reads (`GOOGLE_WIRE_CONTRACT_SENTENCE`, with its remedy) and `developerDetail` names
  the key that broke, mirrored to the Error Inspector — never a developer sentence on a screen.
- `knobs.ts` — `google.refresh.on_open_min_age_seconds` (shared with the Agenda, seeded by
  lane U-W2) and `google.docs.append_heading` (seeded by
  `migrations/google_docs_append_heading_knob.sql`), both through `useEffectiveKnob`.
- `GoogleDocumentPanel.tsx` — the body read view, the four unavailable actions (all four act
  IN PLACE — nothing inside the Detail primitive navigates away), the Append composer, and
  refresh-on-open. It also owns `googleFileHref(row)`, the door to Google derived from
  `external_id` when `external_url` is null, used by the strip and by the body copy so the
  sentence and the door cannot disagree.
- `refreshBus.ts` — the strip's Refresh and the panel are two components of one panel; a
  refresh announces itself so the body re-reads instead of the button appearing to do nothing.
- `openRecord.tsx` — 🚨 **THE BIRTH DOOR AND THE ONLY WAY IN.** `hasGoogleDocumentRecord`
  (exactly the two picked types `refresh_document` resolves — a Slides deck has no Record and is
  never offered the control), `useOpenGoogleDocumentRecord` and
  `OpenGoogleDocumentRecordButton`. It reads the Record this picked resource already has, and
  when there is none it refreshes one into existence and opens the id the SERVER returned — the
  client never inserts into `workbench.google_document`. It does NOT refresh on open: that
  decision lives once, in `GoogleDocumentPanel`, against
  `google.refresh.on_open_min_age_seconds` and with the detached guard.
  `OPEN_GOOGLE_RECORD_CONSEQUENCE` is the sentence every list prints beside the control, because
  the first open spends a Google call and keeps a copy of the file here.

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
  parser, the Google Calendar door, the four unavailable actions as sentences, THE attendee →
  People resolver (`resolveAttendeePeople`, one-to-many) and the frozen-row words
  (`frozenEventNotice`).
- `OpenItemsCount.tsx` — "2 open deals" beside a Person, ONE component read by both the agenda
  and the event's Detail (F-59/N4). Capped read, so a count at the cap says "50+"; a failed read
  says it could not be read rather than claiming zero.
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
- `CalendarEventSections.tsx` — the detail's attendees section, the read-only section, the
  Reconnect action (F-59/N11 — the Google connect window IN PLACE, plus the one honest line about
  why re-picking means nothing for a meeting), and (F-52)
  the availability section: "Keep as AI Matrx data" / "Archive" for an event Google is not
  answering for, ONE generic server pair reused from `documents/service.ts`
  (`detachSyncedRecord` / `archiveSyncedRecord`) with `CALENDAR_EVENT_TABLE`
  (`communication.calendar_event`) — never a second endpoint. Absent entirely for an `available`
  event (law 4).

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

🚨 **ONE ATTENDEE ADDRESS CAN BE TWO PEOPLE, AND BOTH ARE DOORS.** Both surfaces built
`new Map(people.map(p => [p.email, p]))` and computed the leftovers as `!byEmail.has(p.email)`:
a shared inbox, a role address or a duplicated contact gave two Persons one address, the Map kept
the LAST, and the complement could not catch the loser because the key was present — one real
Person vanished with no word (F-59/N3). The join is resolved ONCE, in
`record.ts`'s `resolveAttendeePeople`, as the one-to-many it is; the leftovers are computed from
the Persons that RENDERED, never from the key; and `sharedAddressSentence` says when several
People share an address. Never re-derive this join in a component.

🚨 **A FROZEN EVENT IS MARKED IN THE LIST, NOT ONLY ON ITS RECORD.** A detached or unavailable
event rendered exactly like a live one in the agenda while the header said "Refreshed … from
Google" (F-59/N6). `frozenEventNotice` is the ONE judgement and the ONE set of words — the
agenda row and both record notices read it, so a list and a record can never disagree about a
row's state. An unrecognised `sync_status` is marked too: it is not `available`.

🚨 **A FILTERED AGENDA HAS ITS OWN EMPTY SENTENCE.** `AgendaPanel` takes `filterLabel` and tells
`AgendaBody` it is filtered; it never infers it. That is how a Person card with nothing booked
told a person with a full calendar that their Google Calendar was empty (F-59/N5).

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
  The one adapter is `writeOutcome`; the guard is `write-gate.test.ts`. Since F-58 the review
  bench holds ONE of these writes (the Sheets range); `documents/append` is called from exactly
  one place in the repository, `documents/GoogleDocumentPanel.tsx`, and
  `the-append-lives-once.test.ts` censuses the whole tree to keep it that way. Why it
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

- `2026-09-18` — **F-93: the third Google mirror table got its first door, and the agenda door's
  hardcoded type got its resolver (V-22 NEW-6, NEW-9).** `web.youtube_video` — the third mirror
  beside `workbench.google_document` and `communication.calendar_event`, same shape
  (`external_id`, `external_url`, `synced_at`, `sync_status`) and its connection side
  `channel_resource_id → users.integration_connection_resources` — was a live, LISTED entity with
  no door anywhere: no `hrefFor`, no peek, no in-place opener, so `<EntityRef
  token="web_youtube_video">` rendered nothing and `/detail/web_youtube_video/<id>` showed nothing
  about a stored record. It is now registered in `features/item-presentation/registry.tsx` and in
  `features/scopes/registry/entityRegistry.ts`. Separately, the agenda door in
  `components/mardown-display/blocks/google-kinds/GoogleWorkspaceResultBlock.tsx:560-565` hardcodes
  `type="calendar_event"` beside `event.record_id` while the server stamps `record_table` on every
  event (`aidream/services/google_workspace/tools.py`) — V-22 fed
  `record_table: "media.source_library"` and got an Open control for a `calendar_event` with a
  foreign id, the V-21 `document → udt_document` defect in a new place. The resolver that ends the
  class now exists and is proven against that exact attack: `itemTypeForRecordTable` in
  `features/item-presentation/registry.tsx`, derived from the type map, `null` for an unknown table.
  **The fix is in `RecordDoor` itself, not at the call site** — the shared door takes the row's own
  `recordTable`, prefers it over the caller's `type`, and renders NOTHING when a stamp arrived and
  named a table no item type reads (a refusal, never a fall back to the caller's guess), so every
  present and future caller inherits it; the calendar call site passes `event.record_table` and
  keeps `calendar_event` only as the answer for an older payload with no stamp. Red→green through
  the canonical pipeline (`applyIrKindRoute` → `resolveBlockDispatch`, never the component imported
  directly) in `features/content-ir/__tests__/kind-google-result-families.test.tsx`: against the
  components as F-90 left them the `media.source_library` probe fails with the received markup
  showing `aria-label="Open Weekly sync in AI Matrx"` on a calendar door, 1 failed / 66 passed;
  67/67 after. Censused for siblings: `CalendarEventSections.tsx` carries only `party` doors for
  attendees (correct — an attendee IS a Person record), `GoogleMarketingResultBlock.tsx` passes
  `web_site` with a `site_id` (correct), and no Google surface navigates to `/detail/...` as a
  primary door. No screen was seen.
- `2026-09-18` — **F-90: a Google write answer's honesty is carried by the PREVIEW, not by a flag
  (V-22 findings NEW-8 HIGH, NEW-10, NEW-14).** F-84's two components gated
  "Nothing was written" on `dry_run === true || awaiting_approval === true` while rendering
  `would_append` / `would_write` UNCONDITIONALLY, so a `would_append` carrying neither flag
  printed the whole preview of the person's own document with nothing saying it had not
  happened, and a payload carrying `would_append` AND `appended` printed a green receipt chip
  beside the preview. There is now ONE truth table — `readWriteClaim` in
  [`google-result-shared.tsx`](../../components/mardown-display/blocks/google-kinds/google-result-shared.tsx),
  a pure function both blocks read: the arrival of ANY `would_*` key always leads with "nothing
  was written" (a `would_delete` nobody has written yet included), a completed-write chip
  (`appended`/`written`/`created`/`imported`/`sent`) renders ONLY in the `receipt`/`none` states,
  a payload carrying both NAMES the contradiction instead of resolving it — the block says it
  reports both `would append` and `appended`, is treating it as a preview, and is showing nothing
  as written — and a hold flag that arrived as something other than a boolean (`dry_run: "true"`) is its own state
  rather than an absent hold. Also: a marketing count with no `bounds` now says "(window not
  stated by the provider)" instead of printing bare (NEW-10, `hasStatedBounds` reads the same
  predicate the `Bounds` chips do), and a mirrored row's freshness prints through
  `readRecordSyncNotice` — the calendar record's OWN sentences, never a second wording — so every
  state names what to do, a word this build does not know says so, `detached` deliberately offers
  no refresh (a refresh is refused for a detached row), and every ISO instant prints through
  `lib/detail/format`'s `formatWhen`, the platform's one timestamp formatter, instead of reaching
  a person as `2026-09-18T15:00:00Z` (NEW-14). Proof, through the canonical pipeline
  (`applyIrKindRoute` → `resolveBlockDispatch`, never the component imported directly):
  [`features/content-ir/__tests__/kind-google-result-families.test.tsx`](../content-ir/__tests__/kind-google-result-families.test.tsx)
  — twelve new hostile fixtures reproduced from V-22's probe table plus a 26-row table-driven test
  of the truth table itself; RED against the components at `306edaf2` = 11 failed / 25 passed,
  GREEN after = 64 passed (89 passed with the block-registry suites). NOT fixed here and still
  open from the same verdict: NEW-9, the calendar door hardcodes `type="calendar_event"` and
  ignores the server's `record_table`.

- `2026-09-18` — **F-78: the contract pin now names the field this repo actually reads.**
  `scripts/aidream-contract-pin.json` sat at aidream `62fa56114` while these surfaces read
  `record_id` (and `record_sync_status`, `record_sync_status_reason`, `record_absent_reason`)
  off `SelectedFileResponse`, added in aidream `37600daa78` (F-57, R29). A pin below a field
  the client reads lets `pnpm sync-types:live` accept a server that answers without it, and
  the drop guard cannot speak for a field nothing reads off the generated type. The floor is
  now `37600daa78`. STILL OPEN: `types/python-generated/api-types.ts` predates F-57, so
  `SelectedGoogleFile` (`types.ts`) and `AttachableResource.record_table`
  (`features/connectors/attachable-resources.ts`) remain HAND-TYPED TWINS of the contract and
  nothing forces them to agree. Regenerating needs `pnpm sync-types`, whose offline emit
  imports `aidream.asgi` and therefore needs the five `SUPABASE_MATRIX_*` platform-database
  variables (the scraper domain-config store loads at import time); without them
  `pnpm check:api-types-fresh` answers UNMEASURED, which is never a pass.
- `2026-09-18` — **F-85 (two Bugbot MEDIUMs on F-76's files, both "a screen that lies"): the
  refusal copy no longer announces the act it is refusing, and the agenda no longer calls itself
  empty while the organization question is still being answered.**
  (1) `organizationRefusalMessage` built its sentence as `${subject} was ${act}`, which is honest
  for the subject-less default ("Nothing was saved because no organization is selected.") and a
  lie for every caller that named its subject — `openRecord.tsx` produced "This record **was
  opened** because no organization is selected.", `GoogleDocumentPanel.tsx` "This document **was
  refreshed** because …", and the same shape reached six more call sites outside this feature
  (`useCanvasShare`, `codeEditHistoryFlush`, both `HtmlPreviewBridge` catches, both
  `voiceTranscriptWriter` writers). Fixed in the HELPER, not the call sites: a named subject now
  always renders "was **not** <act>", so no argument shape can construct the affirmative, and
  `act` stays a bare past participle everywhere. Census + guard:
  `lib/organizations/__tests__/the-refusal-never-announces-the-act-it-refused.test.ts`, which
  lists every live call shape in the repo and was red on the old helper.
  (2) `useOrganizationRequired` exposes THREE states and `useAgenda` forwarded two.
  `organizationRequired` is true ONLY once boot has settled, and `isLoading` required an
  `organizationId` that does not exist yet — so during organization bootstrap both read false and
  `AgendaBody` fell straight through to "Your Google Calendar is connected and there is nothing on
  it": the exact sentence F-76 closed, reopened for the seconds before anyone knows the answer.
  `useAgenda` now also reads `resolving`, exposes it as `organizationResolving`, and folds it into
  `isLoading` so the skeleton (not the notice, and not the empty sentence) covers the unknown;
  deliberately NOT extended to a null `userId` alone, which would be an endless spinner for a
  signed-out viewer — the same law-4 defect pointing the other way. Proven red-then-green in
  `calendar/__tests__/the-agenda-is-honest-with-no-organization.test.tsx` (its connector mocks are
  now state-driven, because with no connected account the `noAccount` branch suppresses the
  empty-calendar sentence and the test could not see the lie it hunts). Census of the other seven
  `useOrganizationRequired` consumers found ONE sibling with the same gap —
  `features/agents/components/run-controls/panels/ModelContextPanel.tsx` fell back to "No context
  measurements yet. Fire a turn to populate." during boot, the very lie its own comment claims to
  have fixed — now "Reading this conversation's context…" while `resolving`. The rest are safe:
  `system-jobs`, `useWaitingRuns` and `McpServersAdminPage` start `loading` true, `EduNoteNew`
  shows a spinner, `scanner-health`'s clear-alarms line is gated on a succeeded read, and
  `EncoreRunPage` already read `resolving`.
  Also typed the `postGoogleBackend` stand-in in
  `documents/__tests__/open-record-is-honest-with-no-organization.test.tsx` from the real
  function's `Parameters<…>` with an explicit narrow reply (`Pick<Response, "status" | "json">`,
  because jsdom has no `Response` constructor): `jest.fn(async () => { throw … })` infers
  `Promise<never>`, which refused every `mockImplementation` the file needs (TS2345) — no cast, no
  `ts-expect-error`.

- `2026-09-18` — **F-83 (Bugbot LOW on `80c8027b`): the no-Record and unhealthy-sync-status toasts
  in `chooseFile` (both `GoogleWorkspaceConnectBody.tsx` and `GoogleWorkspaceReviewWorkspace.tsx`)
  now go through `recordToast.info` with the same picked-file identity the success toast already
  carries, instead of a bare `toast.warning`/`toast.info`.** A Slides deck (or any file type with
  no Record table) having no Record is an EXPECTED outcome of a pick, not a fault — `warning` fed
  it into the Error Inspector alongside real errors, and a bare (non-record) toast could outlive
  the file if it left the screen before the toast's timer ran. `info` never reaches the Error
  Inspector (only `error`/`warning` do — see `lib/toast.ts`'s own doc comment), and `recordToast`
  ties the toast's dismissal to the picked file leaving the route, same as every other toast this
  row raises. Proven red-then-green in `a-record-write-failure-says-so.test.tsx`.
- `2026-09-18` — **F-84: the two Google tool-result kinds render as themselves.** `google_workspace_result` and `google_marketing_result` had no `kind_component` row, so every Google answer in chat came out as a generic key/value dump that could not tell a `dry_run` preview from a receipt. Each now has ONE component under [`components/mardown-display/blocks/google-kinds/`](../../components/mardown-display/blocks/google-kinds/); details, states and the RED/GREEN proof: [`features/content-ir/FEATURE.md`](../content-ir/FEATURE.md) Change Log, same date.
- `2026-09-18` — **F-86: a marketing answer now names WHICH site the numbers belong to.** Cursor Bugbot found `site_id` listed in `GoogleMarketingResultBlock`'s `PROMOTED` (so `MetaStrip`/`LeftoverFields` skipped it) with no branch printing it — a Search Console or GA4 answer never said which site the numbers were about. Fixed the class, not the instance: `site_id` now renders in the same `ChipRow` as the channel chip, as a `RecordDoor` (`type="site"`) beside its plain-id chip — the door renders nothing today because `site` has no wired opener in the item-presentation registry yet (the honest fallback), and starts opening the moment one is wired, with zero further code change. Confirmed the marketing tool's output builders (`aidream/services/google_integrations/google_marketing.py`) carry no separate human-readable site name/url field to prefer over the id. Census of every `PROMOTED` key confirmed `site_id` was the only unprinted one; a new test in `kind-google-result-families.test.tsx` (`GoogleMarketingResultBlock.PROMOTED` is now exported for exactly this) asserts every promoted scalar key a fixture sets is visible in the render, red-then-green against the pre-fix component.
- `2026-09-18` — **F-76: an organization refusal with no organization selected is now honest
  everywhere `calendar/service.ts` / `documents/service.ts` resolve one.** CI's
  `check-org-refusal-honesty` found both modules calling `requireOrganizationContext` and leaving
  the person with nothing: `useAgenda`'s window-read effect never ran with no organization
  selected (`if (!organizationId || !userId) return;`), but `isLoading` also read false (its own
  guard needs an organization), so `AgendaPanel` fell through to "Your Google Calendar is
  connected and there is nothing on it" — a confident, wrong claim for a person who has not
  picked an organization at all. `useAgenda` now reads `useOrganizationRequired()` (the shared
  boot-settled gate) instead of `selectOrganizationId` directly and exposes
  `organizationRequired`; `AgendaPanel` checks it first and renders the ONE honest
  `<OrganizationRequiredNotice compact what="Your agenda" />` before every other branch — covering
  the home screen, the window panel, and `PersonUpcomingCard` (same component, composed). On the
  Docs side, the birth door (`useOpenGoogleDocumentRecord` in `openRecord.tsx`) resolves the
  ACTIVE organization itself with no explicit `organizationId`, and its button's catch used to
  hand the raw wire sentence ("Select an organization before sending this request.") straight to
  a toast via `failureSentence`; it now recognises the refusal with
  `presentOrganizationRefusal` and shows the honest, actionable message instead. The action
  catches in `GoogleDocumentPanel.tsx` (keep/archive/refresh) and `CalendarEventSections.tsx`
  (keep/archive) get the same treatment for defence in depth, even though those calls pass the
  record's own `organization_id` and so rarely hit the refusal in practice. 2 new red-then-green
  test suites (`calendar/__tests__/the-agenda-is-honest-with-no-organization.test.tsx`,
  `documents/__tests__/open-record-is-honest-with-no-organization.test.tsx`), each proven red
  against the pre-fix files first (empty-calendar sentence / raw wire sentence shown; both fixed
  files reverted via `git stash`, tests failed, changes restored) and green after; 5 existing
  calendar suites needed `selectShouldPromptForOrganization` added to their `appContextSlice`
  mock once `useAgenda` started reading it. `check:organization-context`'s full chain green;
  `npx jest features/google-workspace` (36 suites / 248 tests) green; `check:parse` green. No
  screen was seen.

- `2026-09-18` — **F-72: the no-append line is chosen by the file's kind (Cursor Bugbot LOW,
  thread 4043568378 on PR 228, commit `2445ceae`, `GoogleDocumentPanel.tsx:622-636`).** F-67's
  append-unsupported branch runs for every non-`document` `mime_kind`, but its sentence always
  named the Sheets A1 range editor — so a record whose kind is `other` (a Slides deck, or any
  other Drive file the two named kinds don't cover) was pointed at a control that has nothing
  to do with it. The sentence is now chosen BY `mime_kind`, not by "not a document": `spreadsheet`
  keeps the existing line naming the range editor; every other non-document kind gets one honest
  line — this file has no write from AI Matrx — plus the record's own derived Google link
  (`googleFileHref`, already in this file from F-60, N12; never a second URL builder). Guard test:
  `documents/__tests__/the-last-two-actions-are-real.test.tsx` adds a direct `other`-kind case
  and a `describe.each` census over `Record<GoogleDocumentMimeKind, true>` (every value the type
  can carry, not a hand list — the object literal fails to compile if the union changes) proving
  the panel renders exactly one of the composer, the range-editor line, or the no-write line, and
  never the Sheets line for a non-spreadsheet kind. Both new assertions were run red against the
  pre-fix panel first (the `other` row rendered "A range write on this Sheet lives in Settings →
  Integrations → Google Workspace") and green after. `pnpm check:parse`, `check:kind-marker-law`,
  and a full `tsc --noEmit` (completed this run, no OOM) are clean for these files — the 221 lines
  the full run reported are all pre-existing, unrelated errors (e.g. `lib/api/call-api.ts`), none
  touching `google-workspace/documents`. No screen was seen — the table still holds zero live rows.

- `2026-09-18` — **F-66, F-60's escalation: the open control names the kind, not just the
  family.** `DetailBody`'s open-at-source control (F-60, same day) derives a label from
  `health.source` alone, which is right for a producer with no opinion but can only ever say
  "Open in Google" for a source that answers for a whole product family — Docs, Sheets and
  Drive files share one health producer, so the derivation cannot tell them apart. The Doc
  registration (`documents/itemType.tsx` + `record.ts`'s new `googleDocumentOpenAtSourceLabel`)
  now sets the primitive's new per-record `health.openAtSourceLabel` field
  (`lib/detail/types.ts`) from the row's own `mime_kind` — the same field `googleFileHref`
  branches on for the URL shape — so a Doc says "Open in Google Docs", a Sheet says "Open in
  Google Sheets", and every other kind (a Slides deck arrives as `other`) says "Open in Google
  Drive". The Calendar registration (`calendar/record.ts`'s `calendarEventHealthOverride`) sets
  it to "Open in Google Calendar" in every branch, rather than leaving it to the same-words
  coincidence of the generic derivation on a short source. Tests: new
  `documents/__tests__/the-open-control-names-the-file-kind.test.ts` (4 cases, one per kind
  plus an unrecognised fallback) and `calendar/__tests__/the-open-control-names-google-
  calendar.test.ts` (4 cases across the health override's branches), both reproduced red
  against the code with the label stripped, then green; the shared
  `lib/detail/__tests__/the-open-control-names-the-source.test.tsx` gained a case proving the
  per-record label wins over the family-wide guess. One existing calendar assertion
  (`a-detached-event-is-a-choice-not-a-refresh-target.test.ts`, "passes an available event's
  health straight through, unmodified") was revised: the registration now deliberately
  annotates every branch with the label, so the old byte-identity check no longer holds and was
  never the point of that test (the point — no control survives that a reconnect cannot
  repair — still holds). The primitive's field was mirrored into the package
  (`aidream apps/shared/detail/src`) in the same session; see `lib/detail/FEATURE.md`'s own
  entry for the full detail on that half.
- `2026-09-18` — **F-67: Cursor Bugbot's three findings on F-60's commit (8093b77a, PR 228),
  fixed.** (a) MED — `GoogleDocumentPanel` mounted the Append composer for every non-detached
  row regardless of what it mirrors, but the composer only ever calls `appendGoogleDocument`
  and is labelled as adding to a Doc — so a Sheet Record (`mime_kind: "spreadsheet"`) presented
  a write the Docs API cannot honour. The composer now mounts only for `mime_kind === "document"`
  (read from the row itself, never guessed from the title); a Sheet gets one honest line naming
  where its range write already lives (Settings → Integrations → Google Workspace's bounded A1
  range editor) instead of a fake control. (b) MED — `CalendarEventReconnectAction` opened the
  Google connect window with only a reason and no `initialConnectionId`, so a person with more
  than one Google account was not sent to the grant that refreshes THIS meeting — the Doc
  sibling's `UnavailableActions` already reads the row's own connection id for this. It now
  passes the event's `synced_via_connection_id`; an event that has never refreshed (no
  connection id yet) opens with none, same as before. (c) LOW — `openRecord.tsx`'s birth-door
  read (`existingRecordId`, checking whether a picked file already has a Record) threw the raw
  PostgREST `error.message` straight to the toast; it now throws the same shape
  `readGoogleDocumentRow` gives this class of failure (`documents/service.ts`, F-60) — one plain
  sentence with a remedy on `message`, the raw response on `cause` for devtools — never a second
  copy of that sibling's exact words, since this is a different read. 6 new/updated tests, each
  proven red against the pre-fix code first: the Sheet-mime-kind composer swap and its Doc
  positive control in `documents/__tests__/the-last-two-actions-are-real.test.tsx`; the
  `initialConnectionId` pass-through and its no-connection-id case in
  `calendar/__tests__/an-unavailable-event-offers-every-real-action.test.tsx`; the plain-sentence
  toast (replacing the old test that pinned the raw PostgREST message as correct) in
  `a-picked-doc-opens-as-its-record.test.tsx`. `pnpm check:parse` and `pnpm check:kind-marker-law`
  clean; a scoped `tsc --noEmit` over the three touched files found nothing new (the full
  project type-check is OOM-killed in this environment, unrelated to this change — 148
  pre-existing errors elsewhere, none in these files). No screen was seen — the table still
  holds zero live rows.

- `2026-09-18` — **F-63: both item cards open; `readGoogleDocument` retired; `calendar_event`
  has a connector product.** Three findings, each fixed at the class:
  - `documents/itemType.tsx` and `calendar/itemType.tsx` now declare `open` (see
    `features/item-presentation/FEATURE.md`'s F-63 entry for the full detail and the census that
    proves it for every registered item type, both Google types included).
  - `readGoogleDocument` in `service.ts` (the read half of the old "Read selected Doc" /
    "Text to append" textarea F-58 already deleted) had no caller left anywhere — verified by
    grepping the whole repo, which turned up only the two test files' `jest.mock` fixtures. Under
    no-legacy it is deleted along with those two mock entries
    (`a-picked-doc-opens-as-its-record.test.tsx`, `a-connected-deck-has-a-row-and-a-door.test.tsx`);
    `readGoogleDocumentRow` (the Record's own typed read, a different function) is untouched.
  - `calendar_event` is now a recognized `GoogleConnectionResourceType`
    (`features/marketing/google/types.ts`'s `GOOGLE_MARKETING_RESOURCE_TYPES`) — the server
    (aidream lane F-62) declared it attachable with `record_table: "communication.calendar_event"`,
    and `isGoogleConnectionResourceType` previously said no to it, which is the exact shape of
    failure `google_presentation` hit in V13-3 (a type outside the list makes
    `connectionResource` throw and takes the whole inventory read down with it). Its connector
    product is `calendar` — already the product `productKeyFor` resolves it to, via the existing
    `calendar_event` alias in `features/item-presentation/sourceHealth.ts`; this entry closes the
    other half. `every-attachable-type-has-a-product.test.ts`'s cross-repo leg, logged as a
    pre-existing failure in F-60's own change-log entry above, is green.

- `2026-09-18` — **F-60: the Doc panel and its strip — plain failures with remedies, actions
  that act in place, and a Google link derived from the file id.** Five findings of
  `common-docs/projects/google-native/VERIFY-U-W1-U-W2.md` (N7, N8, N9, N12, N14), each fixed
  at the class and each proven red first: the new suite
  `documents/__tests__/a-refusal-says-what-to-do.test.tsx` failed **12 of 12** against HEAD,
  printing the exact defects — "The Google refresh answered without a usable id.", the strip
  reading "…did not say why. Open, create and edit only the files you pick. We never see the
  rest of your Drive.", two anchors inside the primitive, "Open at source", and no link at all
  on an `external_url`-null row — and all 12 pass now.
  - **N7 — a wire-contract failure is one sentence with a remedy.** Census of every throw in
    `documents/service.ts`: seven were developer sentences (`requiredString`, `nullableString`,
    `status`, the two in `syncedRecord`, the refresh payload guard) and one was a raw PostgREST
    `error.message` from `readGoogleDocumentRow`. The seven now throw the new
    `GoogleWireContractError`, whose message is *"AI Matrx could not read Google's answer. Try
    Refresh; if it keeps happening, reconnect the account."* while `developerDetail` keeps
    "…without a usable id" for the log (mirrored through `console.error`, which
    `lib/diagnostics/globalErrorCapture.ts` captures). The Supabase read answers one plain
    sentence with its own remedy and carries the response as `cause`. The panel needed no
    change: it renders `extractErrorMessage(error)`, so the class is fixed under it.
  - **N8 — a refusal is followed by its remedy, never by reassurance.** The promise was glued
    on in TWO places, and the fix is one primitive: `features/item-presentation/sourceHealth.ts`
    now owns the promise census (derived from the provider config — every product, not Docs')
    and `grantDetailSentence`, which drops a promise from any strip reporting a refusal and puts
    `health.remedy` last. `documents/itemType.tsx` composes through it and adds
    `FILE_REFUSAL_REMEDY` ("Try Refresh; if it keeps failing, reconnect the account or choose
    the file in Google again.").
  - **N9 — nothing inside the Detail primitive navigates away (PLAN §5.1).** `UNAVAILABLE_LINKS`
    (two `<a href="/user-settings/integrations">`, the second promising the Picker and landing on
    settings) is deleted. `UnavailableActions` renders two buttons: Reconnect calls
    `useOpenGoogleConnectWindow` — the same opener the strip's own Reconnect port calls — with
    this record's connection preselected; "Choose the file again" opens THE Google Picker
    (`lib/googlePicker`, no second picker), re-registers through the connectors' own
    `registerSelectedGoogleFile` and refreshes the record. Picking a DIFFERENT file says so by
    name and registers nothing; a row naming no connection says why it cannot be re-picked
    instead of offering a control that cannot work. `the-strip-and-the-composer-tell-the-truth`
    now pins **zero** links out of the record where it used to pin two.
  - **N12 — the door to Google is derived from the id.** `googleFileHref` builds
    `docs.google.com/document/d/<id>/edit`, `…/spreadsheets/d/<id>/edit` or
    `drive.google.com/file/d/<id>/view` from `external_id` when `external_url` is null (the same
    move `calendar/record.ts` makes for an event), and every branch of the Doc's health
    refinement uses it. The empty-body copy prints "open it in Google" only as a real link, and
    drops the clause entirely when no link can be derived.
  - **N14 (LOW) — the open control names the source.** `lib/detail/core/DetailBody.tsx` labels it
    from `health.source`: "Open in Google" for a source that lists a family ("Google Docs, Sheets
    & Drive files" — "Open in Google Docs" would mislabel a Sheet), the source whole when it is
    short ("Open in Search Console"), and the generic phrase when there is no source. Made
    byte-identically in `@ai-matrx/detail` (`aidream/apps/shared/detail/src/react/DetailBody.tsx`)
    in the same session; `lib/detail/__tests__/the-in-repo-copy-matches-the-package.test.ts` is
    green, so the two copies are even. **Left for the package, not done here:** a per-kind label
    ("Open in Google Sheets" on a spreadsheet) needs a new `openAtSourceLabel` on
    `DetailSourceHealth`, which is `lib/detail/types.ts` + the package — outside this lane's files.
  - Gates: `npx jest features/google-workspace/documents features/item-presentation lib/detail` →
    32 suites / 277 tests pass, 1 pre-existing failure NOT from this lane
    (`every-attachable-type-has-a-product`, because a sibling lane's uncommitted aidream edit adds
    `calendar_event` to `attachable_resource_kinds.json` while this repo's
    `features/marketing/google/types.ts` does not list it yet). `pnpm check:parse` OK (16,671
    files), `pnpm check:kind-marker-law` holds, `pnpm check:dead-ends
    --path=features/google-workspace/documents` clean, scoped `tsc` over this lane's files clean.
    **No screen was seen** — no dev server and no Matrx host is reachable from this container, so
    nothing visual, no Picker hand-off and no real Google refresh is verified.

- `2026-09-18` — **F-59: the agenda and the event record stop dropping People, stop reading
  frozen rows as fresh, and give the note they create a door.** Seven findings of
  `common-docs/projects/google-native/VERIFY-U-W1-U-W2.md`, each fixed at the class and proven
  red first (the four new suites failed 15 tests against `HEAD`, then all 84 in
  `calendar/__tests__` pass):
  * **N3 (HIGH)** — `resolveAttendeePeople` in `record.ts` is now the ONE attendee → People
    resolver, one-to-many, and both `AgendaPanel.tsx` and `CalendarEventSections.tsx` render
    every Person at an address as a door with `sharedAddressSentence` saying so; the Map keyed on
    the address (and the complement computed from the same key) is deleted from both.
    Red: `every-person-at-an-address-is-a-door.test.tsx` — "Dana Upton" absent from both
    surfaces' DOM.
  * **N4** — `OpenItemsCount` moved out of `CalendarEventSections.tsx` into its own module and
    the agenda's Person doors carry it, so §4.6's "name as a door AND a count of open items" is
    true on the list a person actually looks at, from the same source as the record.
  * **N5** — `AgendaPanel` takes `filterLabel`; a filtered list says "Nothing upcoming with
    <name> in the next N days" and each empty day says "Nothing with <name>", instead of telling
    somebody with a full calendar that it is empty. `PersonUpcomingCard.tsx` passes the name.
  * **N6** — `frozenEventNotice` marks a detached / unavailable / unrecognised row in the agenda
    with the record's own words and its own reason, on a dashed muted row
    (`data-agenda-frozen`), so the header's "Refreshed … from Google" stops being false for it.
  * **N10** — "Create a note" now opens the note it created: the toast carries an "Open the note"
    action AND the row keeps a door (`data-agenda-note-door`) that outlives the toast, both
    through the ONE opener (`useOpenDetail("note")`).
  * **N11** — the event's unavailable notice answers all four of the Doc sibling's actions:
    Keep + Archive (B-29's pair, unchanged), **Reconnect** through
    `useOpenGoogleConnectWindow()` — in place, never an anchor out of the primitive — and one
    honest line saying there is nothing to pick again for a meeting, because an event is not a
    file anybody chose. A detached event still offers no Reconnect (nothing repairs a choice).
  * **N15** — `googleCalendarHref` builds the event VIEW
    (`/calendar/u/0/r/event?eid=<base64url>`), not Google's `eventedit` form, and encodes
    base64url + UTF-8, so an id whose base64 carries `+` or `/` no longer produces a URL Google
    cannot decode.
  Gates: `npx jest features/google-workspace/calendar` 13 suites / 84 tests green;
  `check:parse`, `check:kind-marker-law`, `check:dead-ends --path=features/google-workspace/calendar`
  clean; scoped `tsc` over `calendar/**` reports zero errors in these files. **No screen was
  seen** — no dev server and no Matrx host was reachable from this container.

- `2026-09-18` — **F-58: the Detail primitive is the ONE Doc surface, and a picked Doc now opens
  as its Record.** Two findings closed from common-docs
  `/projects/google-native/VERIFY-U-W1-U-W2.md`. **N2** — `GoogleWorkspaceReviewWorkspace.tsx`
  still shipped a read-only "Read selected Doc" textarea and a raw "Text to append" box calling
  `appendGoogleDocument` with the textarea's bytes: no preview of the exact block, no dated
  heading, no `google.docs.append_heading`, no health strip, no Record — and it was the only Doc
  surface a person could reach, so two implementations of one capability disagreed about what
  landed in a customer's document. Deleted, not hidden (no-legacy), together with
  `documentText` / `documentAppend` and the Doc branches of the read and write handlers (now
  `readSelectedRange` / `writeSelectedRange`, Sheets-only and gated on the ONE file-type record
  rather than on "not a Doc"). **N1** — `workbench.google_document` was a table with no reachable
  creator: its only writer is `POST /google-sync/documents/refresh`, whose only callers ran after
  a row already existed, so the Record was created only from the Record and the live table held
  0 rows. New `documents/openRecord.tsx` makes the act that already authorized the mirror — the
  person picking the file — the act that opens it: read the Record for this `resource_id`, else
  refresh one into existence, then open it in place through THE ONE opener (`useOpenDetail`,
  window by default). The control is now on all three picked-resource lists
  (`GoogleWorkspaceReviewWorkspace`, `GoogleWorkspaceConnectBody`,
  `GoogleWorkspaceOverviewBody`) and states its cost before the click. Guards:
  `a-picked-doc-opens-as-its-record.test.tsx` (5 cases — the action exists, the two textareas are
  gone, an existing Record opens with its own identity and spends no Google call, a missing one is
  born through the server's door and the server's id is what opens, and a failed read says so and
  opens nothing) and `the-append-lives-once.test.ts` (a tree census: `appendGoogleDocument` is
  reachable only from `documents/**`, with the detector proven to fail in both directions). Both
  proven RED against `HEAD:GoogleWorkspaceReviewWorkspace.tsx`. `write-gate.test.ts`'s source
  guard follows the bench down to one write. **Not verified in a browser: no screen was seen.**
  Still open and NOT this lane's: the registry entry for `google_document` carries no `open`
  discriminant, so `useOpenItemPresentation` cannot open an agent-emitted Google file card —
  that line lives in `documents/itemType.tsx`, a concurrent lane's file.

- `2026-09-18` — **F-52: the calendar event record gets B-29's own pair — "Keep as AI Matrx
  data" and "Archive" — never a second endpoint.** `types.ts` gains the terminal word
  `detached` (`CalendarEventSyncStatus`); `record.ts` gains `CALENDAR_EVENT_TABLE`,
  `syncStatusOf`, `calendarEventHealthOverride` (a pure merge of the generic connector-grant
  health with what THIS event's own row says — mirrors `documents/itemType.tsx`'s sibling) and
  `agendaIsStaleForOpen` (a detached event's frozen `synced_at` never counts as evidence the
  agenda window needs a Google call — before this, a window whose only event was detached would
  have looked permanently stale and spent a call on every open for a fact no call could ever
  change). `CalendarEventSections.tsx` gains `CalendarEventAvailabilitySection`
  (`KeepAndArchiveActions` / unavailable / detached notices, same shape as the Doc panel's, each
  question naming its consequence in calendar words — what stops refreshing, what stays, that
  Google Calendar is untouched either way) built on the SAME two client functions the Doc panel
  calls (`detachSyncedRecord` / `archiveSyncedRecord` from `documents/service.ts`), never a
  fork. `itemType.tsx`'s health strip states a detached event's choice with `grant: "ok"` and
  offers neither Refresh nor Reconnect; the availability section is absent entirely for an
  `available` event (law 4). `useAgenda.ts`'s refresh-on-open now calls `agendaIsStaleForOpen`
  instead of gating on every row's `synced_at` regardless of status. 17 new tests across 3 new
  suites (83 in `calendar/__tests__`), each proven red first by reverting the five touched files
  to `HEAD` and re-running: 16 of 17 failed (`calendarEventHealthOverride is not a function`,
  `agendaIsStaleForOpen is not a function`, the availability controls not existing yet). No
  screen was seen — the table still holds zero live rows.

- `2026-09-18` — **F-53: Cursor Bugbot's two findings on B-29's detach/archive commit, fixed.**
  (1) `GoogleDocumentPanel` still mounted the Append composer on a detached record — a Matrx-owned
  copy that can no longer reach the Google file, so appending would either call a file the record
  no longer talks to or toast success while the detached body silently never updates. A detached
  record now renders no `AppendComposer`; in its place a one-line, honest notice
  (`data-google-document-append-disabled`) says appends go to Google and this record no longer
  does. (2) `itemType.tsx`'s `enrich` flattened every non-`available` `sync_status` into "Not
  reachable right now", which contradicted the health strip's own "kept as AI Matrx data" sentence
  for a detached record — a choice, not an outage. `enrich` now reads a new exhaustive
  `inGoogleValue` helper (a `never`-typed `default` branch over `GoogleDocumentSyncStatus |
  "unknown"`, so a fifth status word fails to compile instead of landing in the wrong sentence):
  `detached` gets the row's own `sync_status_reason` or "Kept as AI Matrx data"; `unavailable` is
  unchanged; `available` now omits the "In Google" line entirely rather than repeating "Reachable"
  redundantly beside an already-healthy strip. 4 new tests in `documents/__tests__` (51 total),
  each proven red against the pre-fix code first: no-Append-composer + positive control in
  `the-last-two-actions-are-real.test.tsx`, and the four-way `inGoogleValue` mapping in
  `the-strip-and-the-composer-tell-the-truth.test.tsx`. No screen was seen — the table still holds
  zero live rows.

- `2026-09-18` — **F-77 (hostile verifier V-21, finding N1, HIGH): a Record that was never written is
  never called "ready", and its door is never offered.** `registerSelectedGoogleFile`'s response
  carries `record_id` plus, when the server could NOT write the `workbench.google_document` Record,
  a plain `record_absent_reason` sentence saying why (no Record table for a Slides deck, no
  organization named, or the write itself failed, naming the exception class); when it could, an
  optional `record_sync_status_reason` beside a status that is not the healthy one. F-74 parsed all
  four onto `SelectedGoogleFile` and F-77 closes the gap it left open: both `chooseFile`s
  (`GoogleWorkspaceConnectBody.tsx`, `GoogleWorkspaceReviewWorkspace.tsx`) now carry both reasons
  through `freshRecords`, keyed the same way. A row whose fresh pick answered no `record_id` says
  the file is picked and usable, states the server's own sentence verbatim (never a paraphrase),
  and drops the "Open the record" door — the file's own Google link stays; a row whose Record was
  written but is not in the healthy sync state shows that reason beside it. The pick-time toast
  matches: a missing Record gets `toast.warning` with the server's sentence as its description
  instead of "is ready to use"/"is ready", never `recordToast.success`. Red-then-green: new
  `a-record-write-failure-says-so.test.tsx` (6 cases across both surfaces) fails 4 of 6 against
  `HEAD` (468e1bd8) — the door is offered and the sentence is absent — and all 6 pass restored. All
  248 `features/google-workspace` tests pass (35 suites); `pnpm check:parse`, `check:kind-marker-law`
  and `check:dead-ends` are clean on both files; a scoped `tsc` over just these two files reports no
  errors of their own (the repo's ~40 pre-existing errors elsewhere are untouched). No screen was
  seen.

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
- 2026-09-18 — **F-69/F-74: a picked Doc opens the Record its registration returned, and now the
  CLIENT actually carries it.** aidream F-57 (R29) made the three registration doors
  (`/google-workspace/files/register`, `/documents/create`, `/sheets/create`) write or keep the
  Record in the SAME request and answer with `record_id` beside the picked-resource `id`, on
  `SelectedFileResponse`; F-69 taught `openRecord.tsx` to open it directly. `openRecord.tsx`'s
  `PickedGoogleRecordResource` carries an optional `record_id` / `record_sync_status`, and
  `useOpenGoogleDocumentRecord` opens `record_id` directly when a caller already holds it — no
  second read of `workbench.google_document`, no refresh call. That single branch covers a fresh
  pick and a detached Record alike (F-68's `record_sync_status === "detached"` still carries a
  `record_id`, and a detached Record is never refreshed): the hook never distinguishes on status,
  only on whether `record_id` is present. `pickedGoogleRecordResource()`'s narrowing widened to
  pass those two fields through when a caller has them.
  **F-74 closed the gap F-69 left open: the client now actually holds those fields.**
  `SelectedGoogleFile` (`types.ts`) gains `recordId` / `recordSyncStatus` /
  `recordSyncStatusReason` / `recordAbsentReason`, hand-typed (the generated
  `SelectedFileResponse` still lacks all four — see the `pnpm sync-types` note below);
  `service.ts`'s `selectedFile()` parser reads them off the response with a new `nullableString`
  helper (absent/`null` is a real answer, never a defect). `registerSelectedGoogleFile`,
  `createGoogleDocument` and `createGoogleSheet` now send an explicit `organization_id` in every
  request body, resolved through the SAME kernel `organizationContextHeaders` already uses for
  the header (`selectOrganizationId` off the store singleton, through
  `requireOrganizationContext`) — a call site with no organization in reach throws
  `OrganizationContextError` and sends nothing, never a silent request with no organization
  (Law: every write carries an explicit `organization_id`; no resolver picks one). The two
  call sites that open a fresh pick (`GoogleWorkspaceConnectBody.tsx`,
  `GoogleWorkspaceReviewWorkspace.tsx`) now capture the registration's own `recordId` /
  `recordSyncStatus` into local state keyed by the picked-resource id and merge it onto the row
  handed to `pickedGoogleRecordResource()`, so a fresh pick takes the direct-open branch
  immediately instead of the read-then-refresh leg (`GoogleDocumentPanel.tsx`'s repick is a
  different case — it re-registers a file for a Record already open in its own Detail panel, so
  it refreshes that panel rather than opening a second one, and is untouched here).
  Red-then-green: `write-gate.test.ts` gained a case proving `createGoogleDocument` /
  `createGoogleSheet` send `organization_id` and one proving a caller with no organization in
  reach throws before any network call (both red before the field/resolver existed); new
  `a-fresh-pick-opens-direct.test.ts` census-checks both call sites' wiring, proven red by
  reverting each file to `HEAD` (F-69's commit) and rerunning — 4 of 4 failed with no
  `setFreshRecords(` / no `...freshRecords[...]` merge, then all pass restored. All 242
  `features/google-workspace` tests pass (34 suites); `pnpm check:parse`,
  `check:kind-marker-law` and `check:organization-context` are clean; a full `pnpm type-check`
  reports 38 pre-existing errors elsewhere in the repo, none in these files.
  ⚠️ **`pnpm sync-types` still cannot run in this environment** — same failure F-69 found: full
  mode fails at Step 1 (`pnpm db-types`) with `LegacyPlatformAuthRequiredError: Access token not
  provided` (no `SUPABASE_ACCESS_TOKEN`/`supabase login` in this sandbox); `--fast` mode needs a
  local Python backend at `localhost:8000`, absent here. `types/python-generated/api-types.ts`
  was left untouched; `SelectedGoogleFile`'s four new fields stay hand-typed until a session with
  the token or the local server can regenerate the contract and this comment is deleted.

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
