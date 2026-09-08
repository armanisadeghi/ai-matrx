# Meet — calls and meetings on aimatrx.com

**Status:** adopted, **blocked in the room** (see § Blocker) · **Package:** [`@ai-matrx/meet`](https://www.npmjs.com/package/@ai-matrx/meet) `latest` (0.2.0 at adoption) · **Cross-repo SoR:** `../../../common-docs/systems/communications/meet/HANDOFF.md` · **Register:** `../../../common-docs/projects/meet-realtime-intelligence/REGISTER.md` (MRI-D1)

This folder is the HOST BINDING and nothing else. Every behaviour — ringing, the
lobby, host controls, the stage arithmetic, device fallbacks, recording consent,
the AI seam — lives in the package. What lives here is identity injection, app
chrome, and the routes.

## Where everything is

| Piece | File |
|---|---|
| THE ONE `<MeetProvider>` mount | [`../../providers/MeetHost.tsx`](../../providers/MeetHost.tsx) |
| The two invitation handlers on `<MessagingProvider actions>` | [`../../providers/MessagingHost.tsx`](../../providers/MessagingHost.tsx) |
| `<CallButton>` — the one place a person is shown on messaging surfaces | [`../messaging/components/MessagingChrome.tsx`](../messaging/components/MessagingChrome.tsx) |
| The room, both lanes | [`components/MeetingSurface.tsx`](./components/MeetingSurface.tsx) |
| Create a meeting, get its link | [`components/MeetingsWorkspace.tsx`](./components/MeetingsWorkspace.tsx) → `/meetings` |
| Agent identity from Mandates | [`lib/meetMandates.ts`](./lib/meetMandates.ts) + [`lib/useMeetIntelligences.ts`](./lib/useMeetIntelligences.ts) |
| aidream base URL | [`lib/meetBaseUrl.ts`](./lib/meetBaseUrl.ts) |
| Stylesheets (tokens → brand → structure) | `app/layout.tsx` imports 1 and 3; the brand map is the `--mx-meet-*` block in `app/globals.css` |

## Routes

| Route | Group | Why |
|---|---|---|
| `/meet/[slug]` | **`(meet)`** — a NEW chrome-free group | `(core)` renders `AppShell` (wrong for a stage, and a guest has no org to switch); bare `(public)` renders the marketing header/footer AND seeds no `initialReduxState`, so a signed-in person would arrive as a Redux guest with an inert `<MeetHost>`. `(meet)` is the `(kiosk)`/`(portal)` shape plus `getServerAuth()` + `initialReduxState`. Header of [`app/(meet)/layout.tsx`](<../../app/(meet)/layout.tsx>) carries the full evidence. |
| `/meetings` | `(core)` | Creating a meeting is ordinary signed-in work and wants the shell. |

`/meet/*` is deliberately **ungated**: `utils/auth/protected-routes.ts` is a
denylist and names no `/meet` family, so `proxy.ts` never bounces it to `/login`
(verified 2026-09-08). That absence IS the guest path (D6) — do not "fix" it.
The `(meet)` group is absent from `PARKABLE_GROUPS` in `next.config.js`, like
`(kiosk)` and `(portal)`: a durable link must resolve in whatever build is
deployed. The satellite hosts still hand `/meet/*` back to the main origin.

## The laws this binding keeps

- **No agent id in code.** `MeetAgents` is filled from `mandate.definition` rows
  via `useMandateSet`, resolved ONLY while a `/meet/*` surface is mounted. No
  `meet.*` mandate exists yet, so the identity map is empty, every AI capability
  reports unavailable, and the package renders **no** meeting-assistant control.
  Absent, never a dead button. Declaring those rows is **MRI-A5**.
- **Every write carries an explicit `organization_id`** — the package's RPCs take
  it, and `/meetings` refuses to render the form until an org is active.
- **A guest is a first-class identity.** The guest provider is room-scoped, has
  no session and no call center; `<CallButton>` renders nothing for it by the
  package's own rule.
- **Nothing dead, nothing lying.** Every state on these surfaces has a sentence:
  no org, no meet host, an unresolvable slug, an inert provider.

## Blocker — the room does not run on 0.2.0

`useDeviceSnapshot()` feeds `createDeviceManager().snapshot()` — a fresh object
literal every call — straight into `useSyncExternalStore`, so `<PreJoin>` (which
`<MeetingRoom>` always renders first) loops: *"The result of getSnapshot should
be cached"* → *"Maximum update depth exceeded"* → this app's error boundary.
Both lanes reach it and both die there; no host prop can reach the device
manager. Verified live 2026-09-08 against the production backend. The fix is to
memoize the snapshot inside the package — **MRI-A5**.

Two more package defects the adoption had to work around, both also MRI-A5:

1. **Two declaration files re-declare the same branded types**, so `UserId` from
   `@ai-matrx/meet` is not assignable to `UserId` from `@ai-matrx/meet/react`.
   House rule until fixed: **import everything from `@ai-matrx/meet/react`**.
2. **The public `client` prop is the rich internal `SupabaseLike`**, which sends
   tsc into TS2589 against a typed `SupabaseClient<Database>` —
   `@ai-matrx/messaging` already solved this with a shallow prop type and wrote
   down why. One crossing stands in for it: [`lib/meetClient.ts`](./lib/meetClient.ts).
3. **`<IncomingCallHost />` and `<CallButton />` throw when the provider is
   inert**, which is every server render and every signed-out visitor — the
   README's own three-line integration 500s. Guarded once in
   [`components/MeetCallSurfaces.tsx`](./components/MeetCallSurfaces.tsx).

Every one of those wrappers is DELETED when 0.3.0 lands.

## Change log

- `2026-09-08` — claude: **adopted `@ai-matrx/meet` (MRI-D1).** All eight census
  items landed; `/meetings` creates a real meeting against the live database and
  returns a durable link; `/meet/[slug]` is reachable signed-out and resolves the
  meeting through the `anon`-granted RPC. The room itself is blocked on the
  package defect above. Consent notice for the note-taker is a documented host
  stand-in (D10) until the package ships its own.
