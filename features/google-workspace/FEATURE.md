# Google Workspace

> **The whole-platform Google map** — every Google integration across every repo, what is
> wired to the canonical connection and what is an island, and what is still open — is
> [`docs/handoffs/google-integrations.md`](../../docs/handoffs/google-integrations.md).
> Read it before adding any Google capability anywhere.

## Purpose

This is AI Matrx's focused, reviewer-visible Google Workspace product surface. It proves the exact user actions behind the first direct Google OAuth verification campaign without exposing unrelated product features.

## Routes and entry points

- `/google-workspace-review` is the clean production reviewer route.
- `/user-settings/integrations/google-workspace` renders the same reusable workspace inside user settings.
- `GoogleWorkspaceReviewRoot.tsx` is the single provider boundary used by both routes.

## Authorization contract

- Docs and Sheets use `drive.file`, never an account-wide Drive scope. The user selects one Google Doc or Sheet through Google Picker before AI Matrx registers or operates on it.
- The browser Picker token is short-lived, memory-only, restricted to the requested identity plus `drive.file` scopes, and tied to the connected account with `login_hint`.
- The durable refresh token is encrypted in aidream's canonical user secrets vault and is never persisted in the browser.
- Gmail is incremental and uses only `gmail.send`. The product cannot read, search, delete, or organize Gmail.
- Gmail sending requires visible recipients, subject, body, and an unchecked user confirmation immediately before the send action.
- Google Workspace content is not persisted by these endpoints and is not used to train generalized AI models.
- `/privacy-policy` affirmatively states that Google Workspace API data use adheres to the Google User Data Policy, including Limited Use requirements.

## Data and API flow

1. The browser receives an authorization code from Google Identity Services.
2. The browser sends that one-time code directly to aidream `/api/google-integrations/exchange` with the signed-in user's Supabase JWT.
3. aidream stores the refresh token in the canonical vault and safe connection metadata in `users.integration_connections`.
4. Google Picker returns one file id. aidream validates it through `drive.file` and stores only safe metadata in `users.integration_connection_resources` as `google_document` or `google_spreadsheet`.
5. Typed aidream `/api/google-workspace/*` endpoints read or update that exact resource. Gmail sends only the exact reviewed payload.

## The agent half — `agent/`

The same capability, reached from a normal agent conversation instead of this
workspace. Two canonical tools, both offered on the `matrx-user/chat` surface
through the `google` tool bundle:

- **`google_workspace`** (server, aidream) — lists the user's selected Docs and
  Sheets, reads/appends a Doc, reads/writes a bounded Sheet range, and
  *prepares* an email. It never sends.
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

## The in-app half — `export/sendToGoogle.ts`

The ONE path any surface uses to push what the user is looking at into their own
Drive. `sendContentToGoogleDoc(content, title)` and
`sendRowsToGoogleSheet(rows, title)` resolve the connected account, create the
file, and return a link. **No surface owns Google code of its own** — that is
the whole point, and a second per-feature Google client would be a defect.

Two wires carry it almost everywhere:

| Wire | Reaches |
|---|---|
| `components/content-actions/contentActionRegistry.ts` → "Send to Google Doc" | every `ContentActionBar` / `RichDocument` surface: the agent working-document panel, research outputs, transcripts, the Masterwork Record, … |
| `components/agent-copy/ExportMenu.tsx` → optional `sheetRows` | every surface that already exports rows. `MatrxDataTable` passes it, so every canonical list page can send the view it is showing. |

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
`registerSelectedGoogleFile` the settings surface calls.

🚨 **An attached file travels as the reserved `__google_files` CONTEXT key, never
as a `content[]` resource block** (`attach/googleFileContext.ts`; the key must
stay byte-identical to the server's). The server side does two things at once —
names the files for the agent AND injects the Google tool for that turn, even
when the agent's configuration does not carry it. A content block would deliver
the first half and silently drop the second, leaving the agent able to name an
attachment it cannot open. Server half:
`aidream/services/google_workspace/attachments.py`.

## Invariants

- The settings surface leads with a compact account inventory: every personal
  connection shows its Docs/Sheets grant, Gmail-send grant, connection health,
  and current browser Picker session. Selecting the account name or Manage
  action opens that account's controls; Add account starts the existing OAuth
  path.
- File and email verification controls are collapsed under **Test the file
  connection** and **Test the email connection**. They prove the grants; they
  are not the page's primary account-management workflow.
- No Drive list or search endpoint exists in the service, and no agent tool
  accepts a `connection_id` — reach always resolves from a registered
  Picker-selected resource.
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
