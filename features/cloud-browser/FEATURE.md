# FEATURE.md — `cloud-browser`

**Status:** `in-progress` (live data and takeover stream; production acceptance pending)
**Tier:** `1`
**Last updated:** `2026-08-19`

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

## Entry points

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

- Production acceptance still must prove the complete credential, recipe,
  two-step-code, checkpoint, and restore story against real provider accounts.
- The in-app DM channel is offered as an opt-in but its server producer is assist-first
  in the first release (NOTIFICATIONS.md §1.4).

## Change log

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
  (agent-initiated — opens the canvas on `handoff.state === "requested"`). Go-live
  seam: dispatch the chat stream's `human_required` tool event into
  `cloudBrowserSlice` so the handoff fires before the panel is first opened.
- **2026-08-18** — WS-8 initial build: panel (3 media tiers + controller banner),
  profile selector (personal/org/shared + quotas), canonical share dialog, notification
  consent (setup + first-use prompt), D-9 telemetry surface, read-only audit timeline,
  account/consent settings, 30-day deletion flow, health warnings, walkthrough, overlay
  wiring, demo page. Type-check clean.
