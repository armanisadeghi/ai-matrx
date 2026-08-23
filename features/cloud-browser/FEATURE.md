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
   **It refreshes while the panel is open**: `hooks/useWrittenProgress.ts` reads the
   tail on a 2 s cursor (`service.loadProgressSince(runId, afterSequence)` →
   `sequence > lastSeen`, capped at 200, ONE batched `appendProgress` dispatch),
   stops on unmount / terminal run / hidden tab, and reads immediately on
   tab-return. A poll, deliberately, not a subscription — see Invariants.
2. **Screenshots on request (D-8/D-21, event-driven per D-24).** A bounded,
   user-initiated session: a fresh still the MOMENT the agent acts (the chat stream
   stamps `noteBrowserActivity`; bursts debounce), a 15s idle heartbeat between, an
   opt-in 2s Rapid mode, auto-off after 5 min, always re-armable, with a visible way
   out. Never an ambient feed. An open session is observation for the idle timer
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

- **First composer:** the "Cloud browser" row in the `+` attach menu (D-26 — never
  a standing input-bar button) opens the same non-persisted canvas as every later
  conversation; an active run shows as the context-rail pill above the input.
- **Overlay:** `cloudBrowserWindow` — `useOpenCloudBrowserWindow()` /
  `<CloudBrowserWindowController>` (`features/overlays/openers/cloudBrowserWindow.tsx`),
  wired into `OverlayController.tsx` + `catalogue.ts` + `overlay-ids.ts`.
- **Panel:** `components/CloudBrowserWindow.tsx` (a `WindowPanel`).
- **Notification deep link:** `?cloudBrowserHandoff={handoffId}` on any route
  (the server points it at `/chat[/{conversationId}]`), read by
  `components/CloudBrowserHandoffDeepLink.tsx` — mounted globally in
  `app/DeferredSingletonCore.tsx`. It hydrates the run from the handoff id
  through `adoptCloudBrowserRunFromStream` (which refuses to start a browser),
  opens the canvas through the ONE opener, then strips the parameter. The
  parameter name is `CLOUD_BROWSER_HANDOFF_PARAM` in `constants.ts` and its
  server twin is `handoff_deep_link()` in aidream — **change both together**.
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
  only — it NEVER builds a channel and, since 2026-08-23, never stores a
  preference of its own. Each switch is read and written where the platform
  already keeps it (`notificationPreferences.ts` +
  `hooks/useHandoffNotificationPreferences.ts`):

  | Channel | Canonical home | Default |
  |---|---|---|
  | in-app assist | none — **not a preference** (NOTIFICATIONS.md §2); always on | on, not togglable |
  | browser | `users.user_preferences` → `messaging.showDesktopNotifications` (via `useSetting`) | off |
  | email | `users.user_email_preferences.browser_handoff_notifications` | off (opt-in) |
  | text | `communication.sms_notification_preferences.system_alerts`, gated on `sms_enabled` | off (opt-in) |

  Only the one-time "the card was shown" stamp stays on the profile
  (`metadata.cloud_browser_notification_ack`) — §3.2 puts the acknowledgement on
  the PCB owner-side row, and it is a stamp, not a preference. The producer that
  writes the notification is server-side (aidream
  `services/cloud_browser/notify.py`) and reads the exact same three stores.
- **Assists:** `<AssistStrip surfaceName="cloud-browser/panel">`.
- **Confirm dialog / toast:** `confirm()` + `@/lib/toast` (browser dialogs banned).

## 🚨 As many browsers as the user wants — and exactly one default (D-28)

**Arman, 2026-08-23:** *"if the user wants multiple, we give them multiple… they can
have as many as they want… make it easy to start."* This panel used to only SELECT a
browser — no create affordance existed here or anywhere in the platform — so a person
had one browser forever.

- **The door:** the **New browser** button beside the selector →
  `service.createProfile(name)` → `POST /browser-manager/profiles`. The person names
  it (`TextInputDialog`, never `window.prompt`), duplicate names are refused in the
  dialog, and the new browser is selected immediately — creating one and being left
  on the old one is the same dead end as not being able to create it.
- 🚨 **There is NO stored-profile cap, and never a fabricated one.** `ProfileQuota`
  carries `storedProfiles` (a count) and no maximum. It used to carry
  `maxStoredProfiles: 5` — an inline literal in `service.ts`, enforced by NOTHING,
  rendered to the user as "n/5 saved browsers". **Do not add it back.** A real cap
  would be a `platform.feature_knob` (`persistent_cloud_browser.max_stored_profiles_per_user`)
  read at runtime via `lib/knobs/featureKnobs.ts`.
- **`maxLiveRuns: 1` stays** because it is real: one live run per profile is enforced
  by the control plane. That badge is honest; the other one was not.
- **The single default is the SERVER's invariant**, DB-enforced — the panel never
  computes or sets it. A newly created browser is not the default.

## Invariants

- A user may hold any number of browsers; exactly one of them is the default. Never
  render a stored-profile ceiling — there isn't one (D-28).
- Default face is written progress; a live-run block never sits at the top of a page.
- **The default face is LIVE, and it is a poll on purpose.** No `browser.*` table is in
  the `supabase_realtime` publication, this ledger's RLS SELECT predicate is three
  `iam.accessible_entity_ids` unnests per row per subscriber, and a step list is not a
  token stream — 2 s is indistinguishable from instant to a person reading play-by-play.
  A bounded poll therefore has no echo class, no reconnect/backoff/catch-up machinery,
  and no channel lifecycle to leak (this app's ~10 freeze incidents are all realtime's).
  If it ever must be sub-second, the answer is the `supabase-realtime` skill's Rule-1
  checklist plus adding the table to the publication — never a shorter interval.
- **`appendProgress` takes a BATCH.** One dispatch per page of steps; a dispatch-per-row
  loop re-runs every selector once per row and is the documented O(N²) freeze shape.
  De-dup is by `sequence`, which the table guarantees unique per run.
- **The face reads as English, not as a log.** `service.ts`'s `ACTION_PHRASE` /
  `SENTENCE_ACTIONS` turn `type_text` + `#password` into "Filled in `#password`"; the
  raw action name is the fallback, because a step we cannot phrase is still a step the
  person is entitled to see.
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

- **2026-08-23 — stable profile-selector hydration:** keep the Radix Select
  controlled from its first render by representing the not-yet-hydrated profile
  as an empty value. This removes the production uncontrolled-to-controlled
  warning without changing selection behavior. Guard:
  `components/ProfileSelector.test.tsx`.

- **2026-08-23 — the DEFAULT face was blank, and now it is live.** D-8 ruled three
  tiers with written progress as the default; the two OPTIONAL tiers worked and the
  default one rendered nothing. Two independent halves were broken and both are fixed:
  *(aidream)* nothing wrote `browser.action_event` — 0 rows across 47 live runs — and
  *(here)* nothing refreshed it: `useCloudBrowser` called `load()` once on mount, and
  the `appendProgress` reducer was exported and dispatched by nobody. This half adds
  `service.loadProgressSince()` (incremental cursor read), `hooks/useWrittenProgress.ts`
  (bounded poll: open panel + live run + visible tab), a batched `appendProgress`, the
  `WRITTEN_PROGRESS_POLL_MS` CAPS constant, and human phrasing for every ledger action
  so the face reads as sentences rather than command names. Tests:
  `writtenProgress.test.ts`. Producer half: `aidream/services/cloud_browser/FEATURE.md`.

- **2026-08-23 — a user may hold as many cloud browsers as they want (D-28).**
  Added `service.createProfile()`, `useCloudBrowser().createProfile` (creates,
  selects, and loads the new browser), and the **New browser** affordance in
  `ProfileSelector` (named by the user via `TextInputDialog`, duplicate names
  refused). Deleted the fabricated `maxStoredProfiles` from `ProfileQuota`,
  `service.ts`, and `fixtures.ts`; the badge now reads "n saved browsers" — a count,
  not a cap. The selector's personal group is now plural ("My browsers").

- **2026-08-23 — the D-14 notification, actually delivered.** Five defects in the
  handoff chip, fixed across both repos:
  1. **Wrong urgency band** — the chip wrote a bare `3` (NORMAL). It is now
     `assist_priority("urgent")`: a browser paused for a human is the urgent bar.
  2. **Dead-end link** — the chip's href was `/?cloudBrowserHandoff=…`, the
     marketing home page, and **nothing in this repo read that parameter**. The
     landing now exists (`CloudBrowserHandoffDeepLink`, mounted globally) and the
     server points it at the authenticated `/chat` prefix, so a signed-out tap is
     captured as an auth destination and comes back.
  3. **No expiry** — the chip now expires with the handoff.
  4. **No retire path** — every exit (claimed / dismissed / withdrawn / returned /
     expired) now takes the notice down; chips used to accumulate forever.
  5. **Consent ignored and stored in a parallel store** — the four switches moved
     off `browser.profile.metadata` onto the canonical preference tables (see
     *Consumes canonical primitives*), the server reads them before notifying, and
     the in-app row is now stated as always-on instead of a switch that defaulted
     OFF and was never honoured.

  Also: **"Take control" no longer notifies the person who pressed it.**

- **2026-08-22 — control failures stay at one diagnostic boundary:**
  `CloudBrowserBody` catches claim, request, and return control rejections and
  renders their messages through `toastErrorAlreadyCaptured`; `postJson` already
  owns the structured API capture, so the UI adds neither a generic unhandled
  rejection nor a second toast diagnostic. The exact structured retryable
  worker-replacement 503 is ordinary recovery state and is excluded at
  `captureApiError`; other control failures remain captured once.

- **2026-08-21 — handoff bounded exit (server D-pair):** the handoff card gains
  "Dismiss — let the agent continue" (`dismissHandoff` → `POST
  /runs/{id}/dismiss-handoff`) beside "Step in and help". Server side, an
  unclaimed handoff now also EXPIRES (lazy `expires_at` enforcement) and the
  agent can withdraw its own via `cloud_browser action="dismiss_handoff"` — a
  run can no longer be stranded in `handoff_requested`. Only an unclaimed
  handoff is dismissible; a claimed episode exits via Return control.

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
