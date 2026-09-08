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

- **No agent id in code, and no prop to put one in.** Since `@ai-matrx/meet`
  0.3.0 every meeting capability is a Mandate the SERVER resolves at run time
  (`meet.live_notes`, `meet.live_intelligence`, `meet.wrap_up`), so this app
  injects nothing at all and an organization rebinds a job in the Mandate admin
  with no deploy here. `lib/meetMandates.ts` and `lib/useMeetIntelligences.ts`
  are DELETED; a Mandate with no Holder now produces the server's own refusal on
  the meeting screen, which is more honest than a control that never appeared.
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
| `NoteTakerConsentNotice` in `MeetingSurface.tsx` — a documented stand-in, because 0.2.0 shipped a notice for RECORDING only | Deleted. `<MeetingRoom>` renders the package's own consent banner and People-panel row for every participant (D10). |
| `lib/meetMandates.ts` + `lib/useMeetIntelligences.ts` — four mandate lookups per meeting surface, to fill `MeetAgents` | Deleted. There is no `agents` prop and no `transport` prop; capabilities are server-owned. |

If a future defect tempts a fifth wrapper, the answer is the same: fix it in the
package, release, adopt — never a crossing in here.

## Known blockers on this surface (2026-09-08, MRI-A9)

Both were found by the FIRST browser proof of the in-room intelligence panel and
neither is fixable in this folder or in the package. They are named here because
a reader of this surface will otherwise conclude the package is broken.

1. **No host control ever appears — the token carries no `role`.** Feedback
   `7418ef78-6168-42d5-ae79-172ca9ec849d`. `aidream/services/meet/service.py`
   mints participant metadata without a `role` key, and the package reads a
   participant's role out of the SERVER-MINTED metadata by design (a client that
   could name itself host could mute anyone). So the actual host is a plain
   participant everywhere: no "Start note-taker", no host menu, no lobby
   admission, no "End meeting for everyone". Absent, not dead — correct
   behaviour on wrong data. One-line fix at the source.
2. **The durable realtime feed delivers nothing.** Feedback
   `761359a4-b799-4e19-8bf5-d1c03f6e7ae2` (critical). None of
   `communication.meet_transcript_segments`, `meet_notes`, `meet_meetings` are in
   the `supabase_realtime` publication, so the Postgres Changes subscription the
   package opens is silent forever — it subscribes successfully and no row ever
   arrives. Only the join-time backfill read works, which is exactly why the
   surface looks healthy on load and then stops moving. This is THE blocker for
   "captions, live notes, Q&A and the wrap-up without a page reload".

## Change log

- `2026-09-08` — claude: **adopted `@ai-matrx/meet` 0.3.2 then 0.3.3 (MRI-A9),
  and the in-room intelligence panel was seen in a browser for the first time.**
  0.3.2 makes attendance independent of devices — a denied microphone no longer
  aborts the join, which is what had made the whole in-room surface unreachable
  from the Browser pane. 0.3.3 fixes the second defect the proof itself exposed:
  the roster was only ever built by a media event, so a listen-only attendee was
  absent from their own People panel. Proven live on `/meet/1d3-8988-d71`
  against production and the deployed note-taker: listen-only join with the
  honest notice, tiles, the consent banner, a note-taker tile, live captions per
  speaker, and a streamed Q&A answer citing the durable speaker names. Two
  blockers found and NOT fixed here — see the section above.

- `2026-09-08` — claude: **adopted `@ai-matrx/meet` 0.3.0 (MRI-A5), same
  session.** The assistant is server-owned: `agents` and `transport` are gone
  from `<MeetHost>` and both host modules that existed only to fill them
  (`lib/meetMandates.ts`, `lib/useMeetIntelligences.ts`) are deleted, as is the
  `NoteTakerConsentNotice` stand-in in `MeetingSurface.tsx` — the package now
  renders the consent banner and the People-panel row itself (D10). The room
  additionally gained live captions reconciled against durable transcript rows
  (D16), the note-taker's five honest states with the server's refusal verbatim,
  a streamed answer in the assistant panel, and a host "End meeting for
  everyone" control whose 404 (the `/v1/meet/end` route is MRI-A6's and is not
  served yet) renders a sentence instead of a dead button.
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
