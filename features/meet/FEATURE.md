# Meet — calls and meetings on aimatrx.com

**Status:** adopted and running — the room renders, joins, and admits from the lobby against production data · **Package:** [`@ai-matrx/meet`](https://www.npmjs.com/package/@ai-matrx/meet) `latest` · **Cross-repo SoR:** `../../../common-docs/systems/communications/meet/HANDOFF.md` · **Register:** `../../../common-docs/projects/meet-realtime-intelligence/REGISTER.md` (MRI-D1, MRI-A5a)

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
| `<IncomingCallHost>` — mounted ONCE, directly | [`../../providers/MeetHost.tsx`](../../providers/MeetHost.tsx) |
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

## Zero wrappers (and why that is the point)

**There is no host code here that stands in for a package defect.** The four
wrappers this adoption was forced to write against `@ai-matrx/meet` 0.2.0 are
all DELETED, because 0.2.1 fixed every one of them in the package where they
belonged (C22, THE SAME-SESSION LAW):

| What 0.2.0 forced | What is here now |
|---|---|
| `<PreJoin>` looped on an uncached `getSnapshot` and killed every room | Nothing. `<MeetingRoom>` renders. |
| `lib/meetClient.ts` — one cast, because the public `client` prop sent tsc into TS2589 | Deleted. `<MeetProvider client={supabase}>` and `createMeetRepository({ client: supabase })` take the app's own client directly. |
| `components/MeetCallSurfaces.tsx` — guards, because `<IncomingCallHost/>` and `<CallButton/>` threw while the provider was inert | Deleted. Both are mounted directly; they render nothing on their own until there is a runtime. |
| The house rule "import everything from `@ai-matrx/meet/react`", because two declaration files re-declared every branded type | No longer required (one dts pass). Still the tidier habit in a React file, and still what these files do. |

If a future defect tempts a fifth wrapper, the answer is the same: fix it in the
package, release, adopt — never a crossing in here.

## Change log

- `2026-09-08` — claude: **all four package workarounds deleted (MRI-A5a).**
  `@ai-matrx/meet` 0.2.1 memoizes the device snapshot (the loop that killed
  every room), stops throwing while the provider is inert, takes a shallow
  `client` type, and ships one declaration of every branded type.
  `lib/meetClient.ts` and `components/MeetCallSurfaces.tsx` are gone and their
  callers pass `supabase` / mount the package's components directly. Verified
  live: `<PreJoin>` renders, the `/api/v1/meet/token` round trip succeeds, a
  guest reaches the lobby and is admitted from the host tab, and both tiles
  appear.
- `2026-09-08` — claude: **adopted `@ai-matrx/meet` (MRI-D1).** All eight census
  items landed; `/meetings` creates a real meeting against the live database and
  returns a durable link; `/meet/[slug]` is reachable signed-out and resolves the
  meeting through the `anon`-granted RPC. The room itself is blocked on the
  package defect above. Consent notice for the note-taker is a documented host
  stand-in (D10) until the package ships its own.
