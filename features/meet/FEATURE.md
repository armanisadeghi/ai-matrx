# Meet — calls and meetings on aimatrx.com

**Status:** adopted and running — the room renders, joins, and admits from the lobby against production data · **Package:** [`@ai-matrx/meet`](https://www.npmjs.com/package/@ai-matrx/meet) `latest` · **Cross-repo SoR:** `../../../common-docs/systems/communications/meet/HANDOFF.md` · **Register:** `../../../common-docs/projects/archive/meet-realtime-intelligence/REGISTER.md` (MRI-D1, MRI-A5a)

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
| Create a meeting, list every meeting incl. ended ones | [`components/MeetingsWorkspace.tsx`](./components/MeetingsWorkspace.tsx) → `/meetings` |
| The meeting RECORD after `ended_at` | the package's `<MeetingRecordView>`, routed to by `<MeetingRoom>` — nothing here |
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
- **A guest who attended can read what the meeting produced, and NOTHING here
  decides how much.** `@ai-matrx/meet` 0.5.0 (MRF-1): `useMeetingRecord` picks
  the guest door by itself — `GET /api/v1/meet/record`, authorized by the room
  token that device kept, with the shared subset resolved server-side from the
  meeting's own setting, then the organization's `meet.guest_record_access`
  knob, then the platform default `summary`. This repo changed **nothing** for
  it: `GuestRoom` already mounts the provider with the resolved meeting row and
  `<MeetingRoom>` already flips to the record when `ended_at` is set. An
  administrator changes the organization's answer at
  **/administration/users/limits → Feature knobs**; a host changes one meeting's
  from the record view or the People panel.

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

Found by the FIRST browser proof of the in-room intelligence panel; neither was
fixable in this folder. They are kept here with their resolutions, because a
reader of an older tag will otherwise conclude the package is broken.

1. ~~**No host control ever appears — the token carries no `role`.**~~
   **RESOLVED 2026-09-08 (MRI-A11), feedback `7418ef78`.** The mint now decides
   ONE word — `host | participant | guest`, from `host_user_id` or a real `iam`
   grant — and carries it on the token response, in the token's participant
   metadata, and as the LiveKit participant attributes
   `matrx.participant.role` / `matrx.participant.can_record`. `@ai-matrx/meet`
   0.4.0 takes the stronger of the token grant and the roster entry, so a host's
   controls are correct on the first frame of the room rather than one roster
   event later. Nothing in this folder decides it, and nothing in this folder
   had to change for it.
2. **The durable realtime feed delivers nothing.** Feedback
   `761359a4-b799-4e19-8bf5-d1c03f6e7ae2` (critical). None of
   `communication.meet_transcript_segments`, `meet_notes`, `meet_meetings` are in
   the `supabase_realtime` publication, so the Postgres Changes subscription the
   package opens is silent forever — it subscribes successfully and no row ever
   arrives. Only the join-time backfill read works, which is exactly why the
   surface looks healthy on load and then stops moving. This is THE blocker for
   "captions, live notes, Q&A and the wrap-up without a page reload".

## Change log


- **2026-09-12 — adopted `@ai-matrx/meet` 0.5.0 (MRF-1: guests and the
  post-meeting record).** A guest following a meeting link afterwards used to
  get four honest refusals where the record should have been. Arman ruled that
  guest access is a configuration and never a question, so the package now
  reads the shared subset from the server with the room token the device kept,
  and a host sets the level from the record view or the People panel.
  **This repo changed nothing but the version and one adjacent fix** — the
  "zero wrappers" contract working again. The adjacent fix is in the knob admin
  panel, not in Meet: `platform.feature_knob` rows with `allowed_values` (64 of
  them platform-wide, including this new one) were edited in a free-text field
  with a `datalist`, so an admin could type a word the database then refuses and
  only learn it on save. A closed set is now a real `<select>`, and a boolean
  knob is an on/off select rather than a field where anything but the literal
  "true" silently meant false.

- **2026-09-09 — adopted `@ai-matrx/meet` 0.4.12 (MRI-A16 at 0.4.8 + 0.4.9 + 0.4.11 + 0.4.12; 0.4.10 is a parallel
  guest-read fix that builds on them).** 0.4.9 is the defect 0.4.8 walked into by fixing the one
  above it: the recording control asked `state === "idle"`, which only worked while the store never
  learned a state it had not patched itself, so once the durable states arrived a meeting whose
  recording was `available` lost its Start control for the rest of the session. 0.4.11 is the second: the new durable lobby feed ignored every row that was not `knocking`, so admitting a guest from another tab left this host offering to admit somebody already in the meeting. 0.4.12 is the third: streaming a recording rides a `SameSite=None` cookie, which a browser with strict third-party-cookie settings refuses with no readable status, leaving a `<video>` that silently never played — a refused stream is now re-read through the bytes lane and the screen says so. The six defects MRI-C8's independent
  production verification found, all fixed IN the package — this repo changed nothing but the
  version, which is the "zero wrappers" contract working. (1) The record view could not play a
  recording that had landed perfectly: it fetched `/files/{id}/download` with a bearer and no
  organization and got 400 `organization_required`. The package now builds every aidream request
  in ONE org-aware client and a guard fails its build if a second way appears; playback also
  streams through the platform's `POST /files/session` cookie instead of downloading the whole
  file. (2)+(3) The recording indicator never went solid and a guest saw none at all — the durable
  `meet_recordings` state now reaches a member over Postgres Changes and a guest over a new
  `matrx.meet.recording` room event (**needs the matching aidream deploy**; without it a guest
  sees the same nothing as before, never a wrong indicator). (4) The guest's caption rail printed
  the raw LiveKit identity where the host read a name. (5) A knocking participant was invisible
  unless that browser held the lobby broadcast. (6) The guest record view claimed "No wrap-up was
  written" under a panel that had just refused to read those rows.
- `2026-09-12` — claude: **the guest lane now says out loud which meetings a guest may resolve
  (DD-152).** `communication.meet_meeting_by_slug` and `meet_record_consent` are declared
  ANONYMOUS doors that had no gate of any kind: the first handed the whole `meet_meetings` row —
  organization, host, metadata — to anyone holding a slug, the second let an anonymous caller
  holding a meeting UUID mint a `meet_participants` row. Both now refuse an anonymous caller
  (`auth.uid() is null`) a meeting below `link` visibility, with 42501 and a sentence; a signed-in
  caller is unchanged. Meetings carried the column default `internal` ("this organization"), which
  contradicted the guest lane this feature is built for, so the 26 live rows were raised to `link`
  and `meet_get_or_create_meeting` stamps `link` on creation. No reader was added anywhere: the
  `{anon}` `pub_read` policy needs `= 'public'`, and the authenticated arms already matched at
  `>= 'internal'`. Proven live over HTTPS with the published anon key — the link-visible meeting
  resolves, the same meeting at `internal` returns 42501. **Still true and not fixed here:** a
  meeting slug is 10 hex characters (~40 bits) and the door returns the full meeting row to
  whoever holds one. Migration `migrations/dd152_anon_doors_closed_again_and_gated.sql`.
- `2026-09-08` — claude: **adopted `@ai-matrx/meet` 0.4.0 (MRI-A11 + MRI-D2),
  same session.** Two things this surface could not do before. (a) **The host
  gets host controls**: the server now states the joiner's role on the token and
  as a LiveKit participant attribute, so lobby admission, lock, remove, the
  recording control, the note-taker control and "End meeting for everyone"
  render for the host and are ABSENT — not greyed — for everyone else. Blocker 1
  above is resolved and required no host code. (b) **An ended meeting has a
  surface**: `/meet/[slug]` renders the package's `<MeetingRecordView>` instead
  of a pre-join screen once `ended_at` is set — summary, decisions, action items
  with owners, live-note windows, the speaker-grouped transcript, the recording,
  and a Q&A box that still answers from the durable record. Three host changes,
  all of them injection: `<MeetingRoom meeting={...}>` in both lanes of
  `MeetingSurface.tsx` (the guest lane NEEDS it — a link-follower is refused the
  `meet_meetings` table read, so `snapshot.meeting` never populates for them),
  the guest lane no longer asking for a name on a finished meeting, and
  `<MeetingList>` on `/meetings` so an ended meeting has a way in. No wrapper,
  no massage — the record view, the restriction sentences and the recording
  player all ship in the package so every consumer inherits them.

- `2026-09-08` — claude: **adopted `@ai-matrx/meet` 0.4.1 then 0.4.3 (MRI-A12) — a guest with
  no session now gets the live meeting.** Everything durable a meeting produces reached clients
  over Postgres Changes, and `anon` holds no SELECT grant on `communication.meet_notes` /
  `meet_transcript_segments` / `meet_participants` (MRI-A10 ruled that widening it is forbidden),
  so a link-follower saw the join backfill and then nothing. The platform now publishes each
  durable row into the LiveKit room under `matrx.meet.*`, where the room token is the authority,
  and the package feeds it through the SAME projections and store reducers the database path
  uses — deduped by row id, database winning on conflict (D16). **No host change was needed**:
  the handler is inside the room engine. 0.4.3 is the half this repo's own note above had already
  identified and the package had not acted on — `<MeetingRoom meeting={…}>` now SEEDS
  `snapshot.meeting` from the row this surface resolves through `meet_meeting_by_slug`, so a guest
  finally has a meeting record and therefore a Meeting-assistant panel, live captions, and
  somewhere for a room event to land. `next.config.js` also gained
  `allowedDevOrigins: ["127.0.0.1", "0.0.0.0"]`, dev-only: cookies are host-scoped, so
  `http://127.0.0.1:3001` is a genuinely signed-OUT context for verifying any `anon` lane while
  `http://localhost:3001` stays signed in.

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
