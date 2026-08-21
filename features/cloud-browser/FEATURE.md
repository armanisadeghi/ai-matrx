# FEATURE.md — `cloud-browser`

**Status:** `in-progress` (core production lifecycle accepted; provider-account acceptance remains)
**Tier:** `1`
**Last updated:** `2026-08-21`

> Frontend for the **Persistent Cloud Browser** program (WS-8). A real browser that
> lives on our servers, stays signed in to a user's accounts, and lets an agent do
> real work — with a person able to step in when a site needs one.
>
> Cross-repo authority: `common-docs/projects/persistent-cloud-browser/` (PLAN.md,
> EXECUTION.md §WS-8, DECISIONS.md, contracts S1/S4/S6, NOTIFICATIONS.md). This repo
> owns only the panel/share/timeline UI. Do not restate program truth here — link it.

## What it is (the three media tiers — D-8)

1. **Written progress (default).** The agent's live play-by-play from the
   `browser.action_event` ledger, rendered through the canonical markdown component
   (`BasicMarkdownContent`) — discrete structured lines, never a hand-rolled stream.
2. **Screenshots on request (D-8/D-21).** A bounded, user-initiated session: a fresh
   still ~every 5s while open, auto-off after 5 min, always re-armable, with a visible
   way out. Never an ambient feed. An open session is observation for the idle timer
   (D-10).
3. **Takeover stream (D-8 tier 3).** The interactive canvas appears ONLY while a person
   is driving. It claims the server-minted one-use ticket and embeds the authenticated
   WebRTC client from `stream.aimatrx.com`; control renews on the server cadence.

The **controller banner** always names who is driving (agent / me / another person /
system) and carries the accessible non-canvas controls (Take / Return / Request /
Reconnect).

## Taking control — the same duality the composer has (D-25)

**Take control is available whenever the browser is live**, never only when the agent
asked for a person. The server owns that: `POST /browser-manager/runs/{id}/takeover`
raises the `user_requested` handoff itself when the run is not already paused, then
runs the ordinary one-controller CAS (it superseded the bare `claim-control` route,
which 400'd outside an agent-initiated handoff window).

Clicking it notifies the agent through the **exact mechanisms a mid-run chat message
already uses** — never a second signalling path (`hooks/useCloudBrowserTakeover.ts`):

| Path | Mechanism | When |
|---|---|---|
| **Steer (default)** | `enqueueInboxMessage({mode:"steer", kind:"system_message"})` — the Turn-Boundary Inbox | An agent request is in flight. The banner becomes "Please wait while we tell your agent you're taking over" + **Take over immediately**. Control moves on the delivery ack (`injection_consumed` retires the card), or when the run ends first. |
| **Interrupt (escape)** | `cancelExecution` + a `turn_end` system note | The user clicks **Take over immediately**. The run stops, the pending steer note is withdrawn, and because `cancelExecution` carries no reason of its own, the WHY rides the inbox to the agent's next turn. |
| **Immediate** | claim, no notice | Nothing to steer: no bound conversation, the agent is idle, **or the agent itself raised the handoff** — steering a parked agent is a deadlock, it never reaches another boundary. |

**The chat binding is load-bearing.** `useOpenCloudBrowserCanvas({conversationId, runId})`
carries it into the canvas metadata and `CanvasBody` hands both to `CloudBrowserBody`;
without the conversation the surface can only take control immediately, and without the
run id a profile with more than one live browser shows the wrong one. Every opener that
knows them passes them.

**Request control is real.** When another *person* is driving, it writes a durable
`browser.control_request` row through `POST …/control-requests` — the current
controller sees "X asked to take over" in their own banner and grants it by returning
control. It never wrests the wheel away, and it is no longer an alias for Take.

## Saving a login the agent has no credential for (D-11 capture card)

When the agent hits a sign-in it has no stored credential for, it calls
`credential_login action="capture"` instead of asking the person to type a
password where it can see one. The aidream executor raises a
`credentials_missing` handoff carrying the card's SPEC — display name, the
agent's field NAMES + selectors, the known/unknown recipe branch, the expiry —
on `browser.handoff.metadata.capture_request`, which this surface already reads.
`CredentialCaptureCard` renders from it, and the outcome (status + the new vault
item id, never a value) goes to `POST …/runs/{id}/capture-result`, which retires
the card and hands the browser back to the agent — the person never has to take
control just to give it away again.

🚨 **The leak boundary is that one component.** Typed values live in its local
state and go DIRECTLY to `POST /api/vault/browser-login/capture`; they never
enter Redux, a toast, a log, the control plane, or anything the agent reads. The
card SAVES only — the agent signs in afterwards with `action="auto"`, which is
what keeps the fill value-free. The peer implementation is matrx-extend's
`AgentCaptureCredentialCard` (same request shape, same expiry semantics); a
change to one belongs in both.

`LoginCapturePanel` is the different, person-initiated case: someone driving the
browser signs in themselves, with generic selectors, and the values also fill the
live form. When an agent-raised capture card is open, it takes precedence.

## Entry points

- **First composer:** the globe beside the `/chat/new` composer opens the same
  non-persisted canvas as every later conversation. A person can therefore start
  with the cloud browser before sending the first message.
- **Overlay:** `cloudBrowserWindow` — `useOpenCloudBrowserWindow()` /
  `<CloudBrowserWindowController>` (`features/overlays/openers/cloudBrowserWindow.tsx`),
  wired into `OverlayController.tsx` + `catalogue.ts` + `overlay-ids.ts`.
- **Panel:** `components/CloudBrowserWindow.tsx` (a `WindowPanel`).
- **Demo / visibility:** `app/(dev)/demos/cloud-browser/page.dev.tsx`.
- **Redux:** `redux/cloudBrowserSlice.ts` (registered `cloudBrowser` in `rootReducer`),
  selectors in `redux/selectors.ts`.
- **Data seam:** `service.ts` reads browser rows directly through canonical database
  access and calls the Python control plane only for browser work. Shapes in
  `types.ts` mirror the shared contracts.

## Consumes canonical primitives (not forked)

- **Sharing (D-18):** `features/sharing` `ShareButton`/`ShareModal` against resource
  type `browser_profile` (registered in `utils/permissions/registry.ts`). The only
  addition is the shared-session warning copy. No bespoke share flow.
- **Notifications (D-14):** the consent surface records consent for SHIPPED channels
  only (browser / email / SMS / in-app assist) — it NEVER builds a channel. The
  producer that writes the notification is server-side (WS-5 / S5 §P6).
- **Assists:** `<AssistStrip surfaceName="cloud-browser/panel">`.
- **Confirm dialog / toast:** `confirm()` + `@/lib/toast` (browser dialogs banned).

## Invariants

- Default face is written progress; a live-run block never sits at the top of a page.
- Access is user-keyed, never active-org-keyed (an org session shows because the user
  has a real grant). Say **Full** for the `admin` share level.
- Retention shown to the user is **30 days** (D-20); the newest verified snapshot is
  always kept.
- Telemetry (D-9) shows live numbers and labels anything unmeasured as **not yet
  measured** — never 0.
- The walkthrough is honest about the AWS hard session-expiry caveat (D-7).

## Known limits (this build)

- Production now proves start, navigation, idle persistence, same-run resume,
  takeover/reconnect/return, clean stop, and verified encrypted checkpoint restore.
  Credential capture, structural recipe replay, and generated two-step-code entry
  still require acceptance against real provider accounts.
- The in-app DM channel is offered as an opt-in but its server producer is assist-first
  in the first release (NOTIFICATIONS.md §1.4).

The profile's saved `unattendedLogin` and `totpDelegation` choices now drive the
server-owned Playwright executor. A visible password form can invoke the shared
`credential_login` path without another agent round trip only when unattended
login is explicitly enabled; automatic TOTP additionally requires its own toggle.
The frontend never receives a password, seed, or generated code from that path.

## Change log

- **2026-08-21 — the D-11 credential capture card (both halves):** `credential_login
  action="capture"` on the cloud browser used to return `human_required` guidance
  because the private value box existed only in the Chrome extension. It now raises
  a handoff whose `metadata.capture_request` carries the card spec, and this repo
  renders `components/CredentialCaptureCard.tsx` from it — values straight to the
  vault, a value-free receipt to the new `POST …/runs/{id}/capture-result`, and the
  agent unparked without a takeover. aidream side:
  `BrowserManager.open_capture_card` / `record_capture_outcome`
  (`aidream/services/cloud_browser/FEATURE.md`). Ship both halves — the card 404s
  on `capture-result` until aidream deploys.

- **2026-08-21 — the agent-initiated open actually fires (stream→slice seam):**
  `process-stream` now reads a `human_required` result off any completed
  `cloud_browser*` / `credential_login` tool and dispatches
  `adoptCloudBrowserRunFromStream`, so a run that stops for a person opens the
  canvas even when the panel has never been opened — previously the watcher only
  saw handoffs a mounted `useCloudBrowser` had already loaded, i.e. the person
  had to go find the browser themselves. Both payload shapes are honoured
  (`cloud_browser*` names `session_id`, `credential_login` names `handoff_id`
  and no run). It hydrates through the canonical snapshot path rather than
  fabricating a handoff from the tool payload, and `loadSnapshotForRun` refuses
  to start a browser, so a stream event can never conjure one. Decision is a
  pure, tested function (`streamHandoffSignal.ts`) because it runs in the hot
  path of every chat message. **Not yet exercised against a live handoff** —
  that needs a real provider account raising one.
- **2026-08-21 — takeover steer/interrupt (D-25), both halves:** Take control is no
  longer gated on `handoff.state === "requested"` — aidream gained
  `BrowserManager.request_takeover` + `POST /runs/{id}/takeover` (composes
  `open_handoff(user_requested, actor=human)` with the existing CAS claim; the bare
  `claim-control` route was deleted, not kept as a twin). The client reuses the
  Turn-Boundary Inbox for STEER and `cancelExecution` for INTERRUPT rather than
  inventing a takeover channel (`useCloudBrowserTakeover` + its test suite).
  Closed three seams in the same pass: the conversation⇄run binding now flows
  opener → canvas metadata → body (the composer rail routes through the ONE opener
  instead of its own `openCanvas`, and `loadSnapshot` honours a pinned `runId`);
  "Request control" became the real `control-requests` queue instead of an alias for
  Take; and `ControllerState.pendingRequestFrom` is read from `browser.control_request`
  instead of hardcoded `null`, so a queued request is visible to the one person who
  can grant it. **aidream deploy pending** — the client calls `/takeover` today.
- **2026-08-21 — event-driven screenshots + entry-point relocation (D-24/D-26):**
  the chat stream processor stamps `noteBrowserActivity` on every
  `cloud_browser*` / `credential_login` tool start/completion, and an open
  screenshot session captures the moment (debounced) instead of a flat 5s
  poll; the timed cadence is now a 15s idle backstop with an opt-in 2s Rapid
  mode (`useScreenshotSession(runId, rapid)`, ScreenshotFace Rapid toggle).
  The browser's entry point moved to the chat `+` attach menu (direct-action
  row); the context-rail pill shows only while a run is live or the canvas is
  open (`selectCloudBrowserRunLive`). Takeover steer/interrupt (D-25) was
  ruled here and shipped in the entry above.
- **2026-08-21 — consent-driven automatic login:** connected the existing profile
  settings to the shared server-side `credential_login` executor. Password entry
  and delegated TOTP remain separate explicit choices, and all value-bearing work
  stays inside aidream and the browser worker.
- **2026-08-20 — core production acceptance:** the private ECS browser worker and
  server-owned 20-second lease task are live. After repairing the workflow worker's
  least-privilege access to the signed control port, one exact run stayed live over
  repeated idle cycles, resumed on the same session for a second navigation, and
  closed into verified SSE-KMS checkpoint revision 9. The schedule remains enabled
  and returns clean empty-work results after the browser stops.

- **2026-08-20 — reconnect supersession:** reconnecting an expired live-control
  canvas now requests the server's explicit takeover path, atomically revoking the
  prior claimed ticket before exchanging the replacement. The first connection
  remains non-takeover, so two ordinary controllers still fail closed.
- **2026-08-19 — first-open settings:** loading a browser snapshot now selects the
  persisted profile returned by that snapshot. Profile-scoped settings therefore
  save against the browser the user is viewing, including on the very first open.
  The control button is shown only when the browser has actually paused for a
  person, and a failed control claim now produces a visible message instead of an
  unhandled page error.
- **2026-08-19 — first-composer entry:** added the cloud-browser globe to the
  `/chat/new` composer and routed it through `useOpenCloudBrowserCanvas`. The
  entry no longer appears only after the first message creates the full context
  rail.
- **2026-08-19 — private credential capture:** a credential-missing handoff now
  presents a user-only sign-in form after control is claimed. One action writes the
  values through the canonical vault capture endpoint, fills the current browser
  through the human-control boundary, submits the form, and records a structural
  recipe proposal. Values never enter an agent tool argument or result.
  The same panel now lists matching saved sign-ins by label. Choosing one invokes a
  server-to-worker fill; no value returns through the React client. New captures
  also send the run/profile custody needed for the durable account binding and
  login-attempt record.
  A verification-code handoff lists matching saved-account labels and offers the
  server-side generate-and-type operation; the generated code never crosses the
  React client.

- **2026-08-19 — live service and video:** replaced fixture reads with direct live
  browser-table reads and mounted control-plane calls for run, takeover, and
  telemetry operations. The takeover canvas now claims a one-use ticket, embeds
  the real WebRTC client, renews control, and reconnects without rendering the ticket.

- **2026-08-18** — Guarded the fixture/live sharing boundary: symbolic fixture
  profile IDs no longer reach UUID-backed `browser.profile` permission or visibility
  reads; saved UUID profiles still use the canonical sharing system.
- **2026-08-18** — P2-A trigger + reach: the Cloud Browser is now hosted as a
  **canvas item** (`cloud_browser` canvas content type, NON_PERSISTABLE), not a
  standalone route. Extracted `CloudBrowserBody` (chrome-free) from
  `CloudBrowserWindow` so the canvas pane renders it bare and the WindowPanel
  overlay wraps the same body. Two triggers, one open path
  (`useOpenCloudBrowserCanvas`): the composer's "Cloud browser" pill on
  `ConversationContextRail` (attachment-style), and `CloudBrowserHandoffCanvasOpener`
  (agent-initiated — opens the canvas on `handoff.state === "requested"`). Its
  go-live seam was closed 2026-08-21 (see that entry).
- **2026-08-18** — WS-8 initial build: panel (3 media tiers + controller banner),
  profile selector (personal/org/shared + quotas), canonical share dialog, notification
  consent (setup + first-use prompt), D-9 telemetry surface, read-only audit timeline,
  account/consent settings, 30-day deletion flow, health warnings, walkthrough, overlay
  wiring, demo page. Type-check clean.
