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
`ReviewedGmailReceipt`: the server answers the addresses its own parser DELIVERED
to (aidream lane B-10, `/projects/google-native/VERIFY-B1-B2-R2.md` N2), the card
resolves its ask with those, and the CRM therefore records the sent message
against the Person who actually holds the address — `Ada Lovelace
<ada@example.com>` used to be judged as a string no Person holds. A server that
answers no addresses is older than that change: the typed field stands in and says
so in the console. Guard:
`agent/the-card-sends-and-reports-real-addresses.test.tsx`.

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

## Invariants

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

- `2026-09-17` — **one recipient parser, and the reviewed send says who it
  reached** (lane F-25, closing the seam F-20 flagged plus aidream lane B-10's
  N2). `GmailReviewCard`'s private `parseAddressList` is DELETED: it split Cc on
  every comma, so `"Doe, John" <john@x.com>` arrived at the Send-time gate as
  `"Doe` and `John" <john@x.com>`, the gate could read neither, and — failing
  closed, correctly — it refused the send with "\"Doe\" is not an email address
  this can read". The card now uses `splitMailboxField` from
  `features/crm/gmail/mailbox.ts`, the ONE parser, and a genuinely unreadable
  field still refuses: the parse got better, not laxer. And `sendReviewedGmail`
  returns a `ReviewedGmailReceipt` (`messageId` + the `to`/`cc` the server's own
  parser delivered to, `null` from an older server) which the card reports in its
  ask, so the CRM's sent record, its contact point, its Cc attribution and its
  metadata are all judged against what Google got rather than what was typed;
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
