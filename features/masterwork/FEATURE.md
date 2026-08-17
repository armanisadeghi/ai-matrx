# Masterwork — Rulebooks, rules, Masterworks (Masterwork Studio's UI home)

> **Vocabulary is settled** ([`common-docs/systems/vocabulary/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md)
> § Settled — Masterwork; work order: [`docs/handoffs/masterwork-distillation.md`](/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/masterwork-distillation.md)):
> **Rulebook** (was pack) · **a Masterwork** (was desk) · **Build** (was compile) ·
> **Audition** (was backtest) · **Scout** (was Expertise Interviewer) · **Approach**
> (was lane/mode). This feature directory was renamed from `features/expertise/`
> on 2026-08-17 and the code now speaks the canonical words.

> **The one-line law:** an Expert's knowledge lives in a RULEBOOK (data, versioned,
> citable), never in prose inside an agent prompt. Masterworks are BUILT from
> Rulebooks; auditors consume the rules verbatim; every audit verdict cites a rule
> id. This feature is the UI where a non-technical Expert sees, edits, and grows
> their Rulebook — Arman's ruling: _nothing is real until a normal user can see it
> and do it in the UI._

## Status

- **THE UNDERSTUDY — the system that runs from minute one (2026-08-17, vision doc 13;
  vocabulary ruled).** Every Rulebook has ONE Understudy: a crude one-agent Masterwork
  (mandate `masterwork.understudy`, Gemini 3.7 Flash on the DB agent row) that does the
  WHOLE job from the moment the Rulebook exists — zero rules included — and is rebuilt
  FREE and in place on every rules save, so the Expert watches it get better instead of
  filling a form and waiting for value. FE half: `understudy/refresh.ts` (fire-and-forget
  pokes wired into `saveRules` and `createDraftRulebook` — ONE funnel covers the editor,
  wizard, approve-all, and checkup apply; the Scout's server-side writes poke aidream's
  own funnel) + `understudy/UnderstudyCard.tsx` on `/masterwork/[id]` ("Your system is
  already running — try it", live pulse, reuses `TryMasterworkBox` verbatim, self-heals a
  pre-Understudy Rulebook with one free refresh) + a `live` hook on `RulebookKpiStrip`.
  The Understudy row carries `metadata.understudy=true`: it is filtered OUT of the built
  Masterworks list (`MasterworksPage`) and is never releasable to Encore. Server half:
  aidream `aidream/services/masterworks/FEATURE.md` § The Understudy.
- **Live:** `/masterwork` (the module landing — guests get the marketing page,
  signed-in Experts get the Masterwork HOME; see § The landing below),
  `/masterwork/all` (Masterwork Studio — entity-list shell over platform.rulebook),
  `/masterwork/[id]` (rule editor + "Build a Masterwork" dialog + "From a source"
  ingest dialog + "Interview me" side sheet), `/masterwork/[id]/masterworks` (built
  Masterworks + version-drift flags), `/masterwork/admin` (feature map),
  `/masterwork/encore` + `/masterwork/encore/[id]` (the Operator surface — see the
  Encore bullet below).
- **The guided start (2026-08-15; rebuilt as a full page 2026-08-17):** "New Rulebook" is
  `/masterwork/new` (`features/masterwork/intake/NewRulebookFlow.tsx`) — the four-question intake
  from the Distillation vision (goal · who runs it · where the knowledge lives · stakes ·
  benchmark → stored on `metadata.intake`) rendered in the house guided-intake pattern (big
  default-filled option tiles, § Guided intake below), then the registry-driven Approach picker;
  the chosen row's `intake_query` routes into that Approach's surface (interview →
  `/masterwork/[id]?interview=1`, Scout auto-opens).
- **THE RECORD — "Your words" (2026-08-17).** `/masterwork/[id]/record` shows everything the Expert
  has contributed to one Rulebook — every interview turn, every uploaded source, every recording —
  oldest first, with a door on every item and copy-everything (`CopyButtons`: human / for-AI / JSON).
  Reached from a header action on the Rulebook page. Files: `record/service.ts`,
  `record/ExpertRecordPage.tsx`, `record/InterviewChooser.tsx`, `record/copy.ts`. See § The Record
  below for the association and the corpus contract.
- **The Scout interview Approach:** `ScoutInterviewPanel` (AskTutor pattern — useAgentLauncher +
  AgentConversationColumn in a Sheet) talks to the **Scout** agent
  (`4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8`, Sonnet 5, variable `rulebook_id`), which holds the
  server-side `rulebook` tool and lands draft rules on the Rulebook AS the Expert talks; the
  panel watches the Rulebook row's `version` while open and refreshes the page behind the sheet.
- **The file Approach (2026-08-16):** "From a source" offers _Paste the text_ or _Upload a file_.
  An upload goes through the canonical file handler (`useFileUpload` — never a hand-rolled
  upload) and then `POST /masterworks/ingest-file`: a document is read page by page
  (content_processing + a page-extraction job running the distiller Mandates), so each rule
  comes back anchored to real pages; a recording is transcribed first and takes the text lane.
  `RuleProvenance` renders those anchors as DOORS — the page numbers, a link to the source file,
  and a link to the extraction that read it — and flags a quote that failed verbatim
  verification.
- **Encore (2026-08-17) — the Operator door.** `/masterwork/encore` (released Masterworks the
  viewer can reach, shelved mine / my-orgs / public) and `/masterwork/encore/[id]` (the run
  experience; moved from the short-lived `/encore` namespace 2026-08-17, pre-launch, no
  redirects). A Masterwork
  is **draft** until the Expert presses **Release** on the Studio's Masterworks page
  (`metadata.released_at` stamp on workflow.definition, guarded CAS on `version` via
  `setMasterworkReleased`); **only released Masterworks appear on Encore**, and the Encore run
  page refuses a draft (doors the Rulebook owner to the Studio instead). Operator copy is
  jargon-free (THE MISMATCH RULE): "Run", "What it does", "By <expert>" — never "workflow" /
  "compile" / version numbers. Doors both ways: card/name → `/encore/{id}`; "By <expert>" →
  `/masterwork/{rulebookId}` (rendered only when the viewer can read the Rulebook); Rulebook
  owner gets a quiet "Open in Studio"; Studio gets "View in Encore" once released; every run
  row opens in the workflows app. Run machinery is the canonical `TryMasterworkBox` (typed run
  start + adoptForeignStream + followWorkflowRunStream + refresh rejoin) — never a second
  renderer. Files: `encore/service.ts` (VIEW-LAW scoped reads + per-Operator run history),
  `encore/EncoreHomePage.tsx`, `encore/EncoreRunPage.tsx`; nav child "Encore" under
  Masterwork Studio. Deliberately deferred: a "shared with me" shelf (no generic
  shared-with-me list filter exists yet — lib/list-scope Brief 3A; add the shelf when it lands).
- **Server half:** aidream Masterwork services (Build + ingest Approaches + the `rulebook`
  tool, one shared rule builder and one shared CAS write path).
- **Next (work order: docs/handoffs/masterwork-distillation.md):** the Arman-SEO honest test
  (Rulebook `arman-seo-method` scaffolded, draft, owned by Arman — the interview Approach
  unblocks it).

## The landing — `/masterwork` (2026-08-17)

One URL, two audiences (module-landing-pages doctrine, branch-in-page):

- **Guests** get the public marketing landing — `MasterworkLanding`
  (`features/auth/components/module-landing/landings/MasterworkLanding.tsx`, the
  shared `ModuleLanding` shell inside `MarketingPageShell`), registered in
  `MODULE_LANDING_DIRECTORY` so it appears on `/features`. The spine, in Expert
  language: you talk → rules you approve → a system that works exactly your way →
  proof against plain AI. Never a login wall.
- **Signed-in Experts** get the Masterwork HOME (`features/masterwork/home/`):
  your Rulebooks with review-progress KPIs (`computeKpis`), your built Masterworks
  with release state + quality trend (latest vs. previous
  `platform.masterwork_run.quality_score`), recent runs in Expert words, the
  Approach registry as "Start here" tiles (each links to `/masterwork/new?approach=<key>`,
  pre-selecting that Approach), and
  the "How it's improving" panel. Every named entity is a door; every count links
  to the list behind it. The Rulebook LIST lives at `/masterwork/all`
  (the established `/x/all` pattern).

**"How it's improving" — the HONESTY CONTRACT.** The five Masterwork agents
(mandates `masterwork.scout` / `source_distiller` / `exemplar_distiller` /
`rulebook_auditor` / `audition_judge`) are enrolled in Hindsight, but `hindsight.*`
is NOT browser-readable (the schema is not PostgREST-exposed, and RLS scopes rows
to the platform operators' own accounts). The panel therefore renders ONLY what a
signed-in user can truly read: the public mandate registry (`fetchMandatePins`)
plus each bound agent's `agent.definition` revision count + last-changed date. It
NEVER fabricates review activity. Closing the gap (review summaries/findings for
Experts) needs a deliberate server-side read path — tracked in
`docs/handoffs/masterwork-distillation.md`.

## Data

- **Runs — `platform.masterwork_run` (2026-08-17; renamed from `expertise_run`).** Every long
  pipeline (build · ingest · ingest-file · audition) claims a row here BEFORE its first AI call,
  heartbeats every 60s, and persists its terminal status + error + result. It is a **COMPONENT
  of its Rulebook** — access IS the Rulebook's access, so `created_by` is an audit stamp and
  appears in no policy (THE COMPONENT OWNERSHIP LAW), and `is_versioned` is false so a heartbeat
  never writes a history row. The browser stores only the run id and rejoins by it; **never**
  re-derive a run's state client-side. Server: aidream durable-run services ·
  `POST /masterworks/runs/{run_id}/rejoin`.
- **Table:** `platform.rulebook` (Matrx Main; renamed from `expertise_pack`, JSONB column
  `rules` renamed from `principles`). JSONB columns get their app shapes in ONE place:
  [`types.ts`](./types.ts) (`RulebookRule`, `RulebookSections`, `RulebookSource`). Never
  re-declare beside a consumer.
- **Rules (`rules` JSONB array):** `{id, name, section, statement, rationale?, quote?, detection?,
severity, retired?, draft?, source_ref?}`. `id` is the citable handle — audits cite it; never rewrite
  an existing rule's id. `retired` keeps history; `draft` marks agent-suggested rules awaiting the
  Expert's line-by-line approval (human-first invariant — ingestion NEVER auto-activates).
- **Versioning:** every save through `saveRules` bumps `version` with an optimistic lock on the
  loaded version (concurrent edit → readable conflict error, no silent overwrite).
- **Masterworks:** `workflow.definition` rows whose `metadata` carries `built_from_rulebook` +
  `rulebook_version` + `masterwork_kind` (the Build stamp) + `released_at` (the Expert's
  release stamp; absent = draft, Studio-only — an Operator can never run a draft). Drift = `rulebook_version <
rulebook.version` → the Masterworks page flags "rebuild" AND opens the rule-level diff (below)
  — a drift badge without it states a timestamp, not a verdict.
- **Version history — NO Rulebook-specific table.** `platform.rulebook` was enrolled in the
  platform-wide version capture on 2026-08-16 (`platform._version_capture` → `history.row_versions`,
  the same store 138 tables already use). The browser cannot read the `history` schema, so two
  SECURITY DEFINER RPCs expose ONE Rulebook's history — `rulebook_versions` / `rulebook_snapshot`
  (args `p_rulebook_id`) — behind a gate that mirrors the table's own `std_select` RLS predicate
  exactly.
- **The diff is a pure module:** [`rulebookDiff.ts`](./rulebookDiff.ts). It counts only the
  ENFORCED set (the aidream Build drops `draft` and `retired` rules), so an unapproved draft is
  never reported as drift — it is listed separately as "waiting on you". A version older than
  capture has NO snapshot: the dialog says so and never invents a diff.

## Files

- `service.ts` — detail reads/writes (getRulebook, saveRules, createDraftRulebook,
  updateRulebookMeta, softDeleteRulebook, listMasterworksForRulebook). Direct supabase-js,
  RLS live, THE VIEW LAW respected.
- `browse/` — entity-list shell wiring: `service.ts` (mine/orgs/public scoped reads, plain
  PostgREST — no per-feature RPC yet at this population), `columns.tsx`, `listConfig.tsx`,
  `useRulebookRowActions.tsx`, `components/MasterworkStudioPage.tsx`, plus the Approach registry
  read `approaches.ts`.
- `intake/NewRulebookFlow.tsx` — the guided start at `/masterwork/new` (§ Guided intake below).
  The old `NewRulebookDialog` was DELETED 2026-08-17 — a cramped dialog with chip-bubble pickers
  is exactly what the house pattern forbids.
- `durable-run/useMasterworkRun.ts` — the ONE way a dialog here runs something long. A face over
  `lib/durable-run/useDurableRun.ts` (shared with SEO): remembers the run id, rejoins on load,
  settles from server truth, keeps a finished answer across a refresh. Both ingest lanes share one
  run (one dialog, one answer, one pointer). Never fork it — add a `DurableRunWire` instead.
- `components/detail/RulebookDetailPage.tsx` + `RuleEditorDialog.tsx` — the Expert surface. Plain
  language only: "rules", "how to spot a violation", "how bad is breaking it". Zero jargon is a
  requirement, not a style choice (THE MISMATCH RULE).
- `components/detail/BuildMasterworkDialog.tsx` — "Build a Masterwork" (streams
  `POST /masterworks/build` as a durable run).
- `components/detail/IngestSourceDialog.tsx` — "From a source" (paste →
  `POST /masterworks/ingest`; upload → `POST /masterworks/ingest-file`).
- `components/detail/ScoutInterviewPanel.tsx` — the Scout interview Approach (side sheet).
- `components/masterworks/MasterworksPage.tsx` — Masterworks list, run links into
  workflows.aimatrx.com, recent-run history, and the owner-only Audition + feedback doors.
- `components/masterworks/TryMasterworkBox.tsx` — "Try your Masterwork" in place: starts the run
  (adoptForeignStream + followWorkflowRunStream), narrates real node stages, renders the verdict
  through RichDocument. **A refresh rejoins the run** — the run id is kept per Masterwork in
  sessionStorage (`matrx.masterwork.run.<masterworkId>`), and on mount the run row decides:
  still going → `attachWorkflowRun` (the execution system's rejoin primitive; the SSE feed
  replays the node lifecycle so the stage list rebuilds), finished → the verdict shows directly.
- `components/masterworks/AuditionDialog.tsx` — "Compare to the original" (the Audition). Opens
  prefilled with a finished run's own output when launched from the verdict, empty from the card.
  Streams `POST /masterworks/audition`; verdict event `masterwork_audition_verdict`.
- `components/masterworks/MasterworkDriftDialog.tsx` — the rule-level drift answer over
  `public.rulebook_snapshot` + `rulebookDiff.ts`.

## The Record — the Expert's own words (2026-08-17)

> Arman, after dictating ~37,455 characters of his SEO method into ONE interview and finding no way
> back to it: _"There should be a record of it… so I could choose to pick up the one I was having or
> have a new one. Clearly we're not properly associating these things together. That's critical."_
> and _"All of the things that I have said… need to be readily available somewhere in the UI."_

**The relationship — a canonical association, never a column.** A Scout interview is an edge in
`platform.associations`: `conversation --(role 'interview')--> rulebook`, registered in
`platform.association_types` (`container_side='none'` — the pair conveys nothing; whether a Rulebook
should convey access to its interviews is a separate human decision at `/administration/relationships`).
Direction follows the canonical rule — little points to big; many conversations make a Rulebook.
Written ONLY through `associationsService`. **There is no `rulebook_id` on `chat.conversation` and
no junction table, and adding one is the defect this replaced.**

**When the edge is written.** NOT at mint time: `assoc_add` requires real access to both endpoints,
and the server writes `chat.conversation` atomically at stream end, so an early write fails 42501
(verified live). `associateInterviewWhenPersisted()` is a MODULE-LEVEL job — deliberately not tied to
the panel's React lifetime, because the Expert closing the sheet mid-turn is exactly the case where
losing the link hurts most. It waits on the canonical `waitForConversationPersisted`, writes the
edge, then replaces the auto-generated title ("Auto: expertise_interviewer") with
`"<Rulebook name> — interview, <date>"`.

**Loud recovery.** `listRulebookInterviews` cross-checks the edges against rule provenance
(`source_ref.conversation_id`). A conversation named by a rule but missing its edge is HEALED on
read and screamed about — a recovery firing means the proactive write failed. Historical links were
backfilled once from rule provenance **and** `chat.tool_trace.args->>'rulebook_id'` (the only way
Arman's own interview could be found before this existed).

**Resume or start new.** Opening "Interview me" on a Rulebook that already has interviews shows
`InterviewChooser` — when it happened, how many turns, how much was said, how many rules it
produced, the first line the Expert wrote — with **Continue** on each and **Start a new interview**
beside them, plus a new-tab door to the full conversation. Continuing rehydrates the real
conversation through `useConversationResume`. **Never silently mint a new conversation when prior
ones exist.** A fresh interview uses `preferFresh` + a bumped `freshSessionKey` so "start new" can
never revive the surface's last conversation.

**THE CORPUS CONTRACT — `getExpertCorpus(rulebookId, rules)`** (`record/service.ts`) is the ONE way
any consumer gets everything the Expert ever said about a Rulebook. It returns
`{ rulebookId, interviews, contributions, totalChars }` where each contribution is
`{ id, kind: "message"|"upload"|"transcript", text, when, conversationId?, messageId?, fileId?,
timeRange?, pageExtractionJobId?, rulesProduced? }`, ordered oldest first. Assistant turns are
excluded on purpose — this is the Expert's record, not a chat log. **The Final Checkup auditor and
any future Hindsight pass consume this function; a second assembly of the same corpus is a defect.**

**Audio — the Expert's actual voice, in the Record (2026-08-17).** Arman: _"If any of it was
audio — because I transcribed it using the smart agent input — we should even have the audio…
The bottom line is we need that full tracking."_ Dictation was always PERSISTED (the shared
recorder uploads the recording through the canonical file handler and writes a
`transcripts.transcripts` row with `audio_file_path`); what was missing was ATTRIBUTION — the row
knew nothing about the conversation or Rulebook it was dictated into, so it landed nameless in the
general Recordings folder.

- **The stamp is generic, not Masterwork's.** `RecordingOrigin`
  (`features/audio/recordingOrigin.ts`) — `{surface, conversationId?, entityToken?, entityId?,
  label?, href?}` — persisted at `transcripts.transcripts.metadata.origin` (an existing jsonb
  column; **no schema change was needed**). A surface declares it ONCE by wrapping its subtree in
  `RecordingOriginProvider`; `useVoiceCapture` reads it from context, so **nothing was threaded
  through the shared mic chain** and every ProTextarea that declares no origin writes exactly the
  row it always wrote. `ScoutInterviewPanel`'s interview column declares
  `{surface:"masterwork.interview", entityToken:"rulebook", entityId, conversationId, label}`.
- **In the Record.** `getExpertCorpus` gained a THIRD source — additively; it is still the ONE
  corpus assembly: `ExpertContribution.dictations[]`, each `{transcriptId, fileId, title, when,
  durationSec, charOffset}`, rendered as a player via `InlineMediaRef` (`as="audio"` and an
  explicit container height — a bare file id has no mime to infer and `size="fill"` is `h-full`)
  with an `EntityRef` door to the recording. **The match is evidence, not inference:** a dictation
  attaches to a message only when the transcript's first 120 characters appear VERBATIM in it, and
  `charOffset` is where. A dictation that matches nothing becomes its own `transcript`
  contribution rather than being guessed onto the nearest message — a wrong attribution is worse
  than none.
- **The door back.** `RecordingOriginRef` (`features/transcripts/components/`) renders the origin
  on the transcript itself — "You dictated this into &lt;Rulebook&gt; · the conversation".
- **Arman's own interview is backfilled.** All 7 recordings behind conversation `4706f9c0…`,
  matched by verbatim substring at contiguous offsets (0 → 11080 in one message; 0, 5415, 7998,
  14742, 15519 in the 20,007-character one), stamped with the same origin plus
  `metadata.origin_backfill_evidence`. Two other recordings he made the same day matched nothing
  and were correctly left alone.
- **Still open, honestly:** a dictation made before this stamp existed cannot be attributed
  without guessing, so older recordings stay unattached. And the microphone cannot be driven in a
  headless browser, so the write path is proved by
  `features/audio/__tests__/recordingOrigin.test.tsx` (origin → `provider.start()`; origin → the
  persisted row) rather than by a live recording.

## The Final Checkup — `checkup/` (2026-08-17)

**The finish line.** Arman: _"the expert kinda feels like here she is done, and we
could have a button that they click that's kind of like — maybe call it a final
checkup… it's probably a window panel, and it should be split down the middle…
the point is to have it where we can suggest rules that need to be added, rules
that could be modified, rules that should be removed, and the user is just going
through very quickly and sort of approving or disapproving."_

- **Entry:** one "Final checkup" action in the Rulebook page header (owner only,
  once there is something to check). It opens the `masterworkCheckupWindow`
  overlay — a `WindowPanel`, so the Rulebook stays visible behind it.
- **The run:** `POST /masterworks/checkup` on the SAME durable spine as Build /
  ingest / Audition (`platform.masterwork_run`, operation `checkup`). Auditors run
  in PARALLEL and each finding is streamed the moment it is found
  (`masterwork_checkup_finding`), so the Expert starts deciding while the rest are
  still coming; the terminal `masterwork_checkup_complete` document is the truth
  and is merged by id. A refresh rejoins — `useCheckupRun` is a thin face over
  `useMasterworkRun`, never a second durability mechanism. *(Progressive results
  are why `useDurableRun` gained `onDomainEvent`: a run that answers in PIECES
  must not put a spinner over work the user could already be doing.)*
- **NOT a word diff.** Both halves render a rule the way a rule is read, so the
  Expert compares MEANING: left = the Rulebook today (the existing rule for
  modify/remove; the section it would join for add), right = the proposal, the
  reason in their own terms, and their **VERBATIM quote as the evidence** with a
  door to the conversation or source file it came from.
- **Confidence is honest.** Three bands (`confidenceBand`): a low-confidence
  suggestion is labelled "We're guessing — check this one" and is never touched by
  Approve with AI.
- **Fast disposition.** `Y`/`Enter` approve · `N`/`D` dismiss · `↑↓`/`j k` move ·
  `U` undo this one, with auto-advance; keys are ignored while the Expert is
  typing or dictating into a `ProTextarea`. Where a finding carries
  `alternatives`, the Expert clicks the wording they want; they can also rewrite
  the proposal in their own words (`ProTextarea`, so they can dictate it).
- **"Approve with AI" is reviewable, not a black box.** It accepts only findings
  at ≥80% confidence that the Expert has not already ruled on and that carry no
  alternatives (a choice is theirs alone), marks each one `byAi`, shows the count
  in the button ("Approve the 14 we're most sure about"), switches the list to All
  so they see exactly what it took, and offers **Undo those** — which only takes
  back the calls the AI made.
- **Nothing is written until Apply**, and Apply is ONE compare-and-swap through
  the Rulebook's existing `saveRules` (never a second write path, never a
  per-finding save storm). `add` appends a live rule (the Expert approving HERE is
  the human-first act — it is not queued as another draft), `modify` rewrites the
  target **keeping its id** (audits cite it), `remove` **RETIRES** it. A
  concurrent save surfaces as the Rulebook's own conflict message and the fresh
  Rulebook is pulled so the next Apply works. After Apply the Expert reads a
  receipt of exactly what changed, with a door to the Rulebook and an **Undo**
  that restores the previous rules as a real new version.
- **Memory, so we stop asking.** Approved findings need none (they changed the
  Rulebook). A DISMISSAL is recorded on `metadata.checkup.dismissed`, fingerprinted
  by kind + target rule id + proposed name (finding ids are run-scoped and never
  repeat), with the Expert's optional reason. This surface is its only writer;
  aidream's checkup service reads it to suppress what the Expert already refused.
- **Decisions survive a refresh** — they are kept per run id in localStorage and
  restored on rejoin, then cleared on Apply.

## The Approach Registry — `platform.approach` (2026-08-17)

**"Intake is a registry of Approaches, never a hardcoded flow."** The
"how do you want to do this?" step of `/masterwork/new` (`intake/NewRulebookFlow.tsx`) renders the ENABLED
rows of `platform.approach` (canonical system-variant catalog table; family
`'distillation'`; seeded: `interview` · `source` · `exemplar` · `file`) as
Expert-language cards — label, blurb, "You bring", time shape — read directly
via supabase-js in [`browse/approaches.ts`](./browse/approaches.ts). The
knowledge-lives answer marks one card "Suggested for you" (soft hint, never a
route); the chosen row's `intake_query` is appended to `/masterwork/{id}`
(interview carries `{"interview":"1"}` so the Scout opens on arrival), and the
chosen key lands on `metadata.intake.approach` for the Scout to read.

**Every rule says which Approach produced it:** the server lanes stamp
`source_ref.approach = <key>` through the one shared rule builder (aidream
`services/distillation/` — see its FEATURE.md § The Approach Registry);
`RuleProvenance` shows it subtly ("via the … Approach"). Additive — old rules
keep their shape.

**Adding Approach #5 = a ROW** when its `mandate_key` exists and its
`intake_query` points at an existing lane surface — it shows in the picker
with zero code. A genuinely new lane implementation (new surface, new server
pipeline) is what still takes code. Never hardcode an Approach list again.

## The Oracle tap — `oracle/` (2026-08-17, Approach #10's in-app half)

Colleagues (and the Expert themself) already ask the AI questions all day; an answer worth keeping
becomes Rulebook material. Two entry points, ONE implementation:

- **"Add to Rulebook" in the message ⋯ menu** — `messageActionRegistry.ts` (`add-to-rulebook`,
  beside Create Task), assistant + user menus' Actions group.
- **The thumbs follow-up nudge** — [`oracle/RulebookNudge.tsx`](./oracle/RulebookNudge.tsx),
  rendered by `AssistantActionBar`: after the user actively SETS a verdict (positive OR negative —
  "a thumbs up is awesome feedback regardless of whether a Masterwork was involved", Arman), a tiny
  inline pill offers "Add to a Rulebook". Auto-fades ~8s, X + click-away dismiss, never blocks the
  chat, never renders for a user with zero Rulebooks (`hasAnyRulebook()`, cached one head-count per
  session), never fires on hydration or a retraction.

Both open the **`addToRulebookDialog` overlay** ([`oracle/AddToRulebookDialog.tsx`](./oracle/AddToRulebookDialog.tsx),
opener `features/overlays/openers/addToRulebookDialog.tsx`): pick one of YOUR Rulebooks
(`listMyRulebooks()` — explicit mine predicate per THE VIEW LAW; zero Rulebooks → a door to
`/masterwork`), see the derived rule name, save. The write is
[`oracle/service.ts`](./oracle/service.ts) `appendDraftRuleFromMessage`: name = first meaningful
line, word-boundary-truncated at 60 chars; statement = the turn content capped at 4,000 chars;
`draft: true` (invariant 1 — the Expert approves it in review); `severity: "major"`;
`source_ref = { approach: "oracle_tap", conversation_id, note: "Saved from a conversation" }`. It
consumes the canonical `saveRules` CAS from `service.ts` (never a second write path) with a bounded
re-read retry, since appending is commutative. Rule ids minted via the shared `nextRuleId`.
`oracle_tap` is not (yet) a `platform.approach` row — it has no intake entry point; register it
when the email/SMS halves of Approach #10 land.

The interview-variant Approaches ride the same session: `ScoutInterviewPanel`'s
`ELICITATION_CHIPS` now include **"Walk me through a hard case"** (#11 Hardest-Case Debrief — the
chip only stages the story invitation; the multi-pass Critical Decision Method probing lives in the
Scout's DB instructions, agent v7) and **"If I left for two weeks…"** (#15 Vacation Trigger,
succession framing — also a Scout instruction section). Agent prose is NEVER in code.

## Guided intake follows the house pattern (Arman, 2026-08-17)

> Born from a defect: the first "New Rulebook" intake was a cramped dialog whose questions were
> answered with tiny chip bubbles. Arman: "those stupid little small bubbles are horrible" — it
> ignored the guided-intake pattern the platform had already perfected elsewhere.

Any guided creation/intake flow in this feature (and any new one you build) follows the **house
pattern**, whose exemplars are:

- **`/research/topics/new`** (`features/research/components/init/ResearchInitForm.tsx`) — a full
  PAGE, not a dialog; big color-coded option cards; URL-driven steps; wizard-draft persistence.
- **The podcast builder** (`features/podcasts/generator/components/GeneratorForm.tsx`) — big
  option tiles with icon + label + helper, and **a sensible default pre-selected on every
  question** so the user never has to click anything they don't want to.
- **The app builder** (`features/agent-apps/`) — same family.

The rules: a dedicated full page (never a cramped dialog), big tappable option tiles (min 44px,
icon in a tinted square, label + one-line helper, color-coded per question) — **never small chip
"bubbles"** — every question defaulted so the Expert can click straight through, zero jargon,
mobile-first, dark-mode-safe semantic tokens only. `/masterwork/new` is this feature's
implementation.

## The improvement brain — assist chips + the `?assist=` launch contract (2026-08-17)

The Rulebook detail page mounts `<AssistStrip surfaceName="matrx-user/masterwork-rulebook">`
(entity-filtered to the open Rulebook) under the KPI strip. The producer is
`aidream/services/masterwork_assists/` (its FEATURE.md is the system of record): a mostly
deterministic hourly pass that offers ONE concrete elicitation move per chip — a section-scoped
interview for a thin/one-sided section, critique-a-bad-draft (the weak draft is generated
server-side via the `masterwork.bad_draft` Mandate and rides the seed), the audition failure
lever, or an exemplar request — with the `masterwork.approach_selector` Mandate firing only when
the deterministic layer found nothing (once/day cap). Every chip's action is `navigate` back to
`/masterwork/[id]?assist=<dedupe_key>`; the page resolves the row through
`features/masterwork/assists.ts::fetchAssistLaunch` and its `metadata.launch` contract opens the
Scout panel with the composer SEEDED (never auto-sent — the Expert always presses send) or the
ingest dialog. The move ledger lives on `rulebook.metadata.elicitation` (server-owned; this
surface never writes it). A chip repeating what the page renders (the draft-review backlog) is
deliberately never produced.

## Registration

- Entity token `rulebook` (platform.entity_types; renamed from `expertise_pack`) + FE overlay in
  `features/scopes/registry/entityRegistry.ts` (`hrefFor` → `/masterwork/{id}`; peek falls back to
  RegistryPeek automatically).
- `platform.shareable_resource_registry.url_path_template` = `/masterwork/{id}`.
- Sidebar: `features/shell/constants/nav-data.ts` ("Masterwork Studio").

## Invariants

1. **Human-first:** anything machine-generated lands as `draft: true` rules or a `status='draft'`
   Rulebook; the Expert approves in this UI. No auto-activation, ever.
2. **Version honesty:** Masterworks display the Rulebook version they were built from; a stale
   Masterwork is flagged, never silently drifting — and the flag opens the rule-level diff of what
   actually moved. Absent history is stated, never papered over with a diff against the current
   rules.
3. **Copy is for a brilliant NON-technical Expert** — a doctor must be able to correct their
   Rulebook here.
4. **Review states are transient, and the Scout must clear them.** A rule can be `draft`,
   approved, `rejected` (+ the Expert's written reason in `feedback`), or `retired`
   (`ruleState()` in `types.ts` is the ONE precedence). `feedback` on any rule is a
   request-changes note. The Scout resolves all open feedback every turn through the `rulebook`
   tool: a rejected rule is rewritten per the feedback (re-queued as a fresh draft) or
   withdrawn; a change request is applied in place (an APPROVED rule stays approved). Applying
   feedback consumes it; the Expert approving clears it. A rejected rule always keeps
   `draft: true` so a Build can never include it. Approve-all never touches rejected rules.
5. **Every textarea in this module is `ProTextarea`** (mic + transcription) — the Expert talks,
   never types, unless they want to.

## Change log

- 2026-08-17 — **The Understudy shipped** (running-from-minute-one, § Status top bullet):
  `understudy/refresh.ts` + `understudy/UnderstudyCard.tsx`, pokes wired into `saveRules` +
  `createDraftRulebook`, `Masterwork.understudy` flag parsed in `parseMasterworkRow`,
  Understudy filtered out of `MasterworksPage` and the built-count button, KPI strip `live`
  hook, `stageLabel("understudy")`. Server half + live verification (real Gemini 3.7 Flash
  run on Strunk): aidream `services/masterworks/FEATURE.md`.

- 2026-08-17 — **The Oracle tap (in-app) + two interview-variant Approaches shipped.** New
  `oracle/` (service + AddToRulebookDialog + RulebookNudge, overlay `addToRulebookDialog`),
  "Add to Rulebook" in the message ⋯ menu, the thumbs follow-up nudge in `AssistantActionBar`,
  and the Hardest-Case Debrief + Vacation Trigger chips on `ScoutInterviewPanel` (CDM probing
  added to the Scout's DB instructions, agent v7). See § The Oracle tap.
- 2026-08-17 — **The guided start rebuilt in the house pattern.** `NewRulebookDialog` (chip-bubble
  intake in a dialog) DELETED; replaced by the full page `/masterwork/new`
  (`intake/NewRulebookFlow.tsx`): big default-filled option tiles for the four intake questions
  (every answer pre-selected), the Approach picker as large registry-driven cards with the
  "Suggested for you" soft hint pre-selected, URL-driven steps, wizard-draft persistence
  (`wizardId: masterwork-new`). Entry points rewired: home "New Rulebook" + empty state, the
  "Start here" Approach tiles (now links carrying `?approach=<key>`), and the Studio list button.
  See § Guided intake follows the house pattern.
- 2026-08-17 — **The landing shipped + routes settled.** `/masterwork` is the module landing
  (guest marketing page via `ModuleLanding` + directory registration; authed Masterwork HOME —
  `features/masterwork/home/`: Rulebook KPIs, Masterworks with quality trend, recent runs,
  Approach tiles, the honest "How it's improving" panel). The Rulebook list moved to
  `/masterwork/all`; Encore moved to `/masterwork/encore` + `/masterwork/encore/[id]` (old
  `/encore` deleted, pre-launch, no redirects); nav children + FeatureAdminMap + every internal
  link updated. `computeKpis` widened to `Pick<Rulebook,"rules">` so overview surfaces can reuse it.

- 2026-08-17 — **The Final Checkup shipped** (`features/masterwork/checkup/`, section above): the
  split-down-the-middle `masterworkCheckupWindow`, findings streamed one at a time off the durable
  `checkup` run, keyboard disposition, a reviewable-and-undoable "Approve with AI", one CAS apply
  through `saveRules` (add appends · modify keeps the id · remove RETIRES), a receipt with Undo, and
  dismissal memory on `metadata.checkup`. `saveRules` gained an optional whole-column `metadata`
  argument so a rule change and the memory that explains it land in ONE compare-and-swap;
  `useDurableRun` gained `onDomainEvent` for runs that answer in pieces; rule-id minting moved to the
  one shared `ruleIds.ts` (the rule editor and the checkup mint them identically).
- 2026-08-17 — **THE RECORD shipped, and interviews are properly associated.** A Rulebook and its
  Scout conversations now share a canonical `platform.associations` edge (registered pair, backfilled
  from rule provenance + `chat.tool_trace`); "Interview me" offers every prior interview with
  Continue / Start a new one instead of silently minting a new conversation; `/masterwork/[id]/record`
  ("Your words") shows every user message, upload, and recording for one Rulebook with doors and copy
  affordances; `getExpertCorpus()` is the one corpus contract other agents consume. Also extracted
  `useConversationResume` (`features/agents/hooks/`) — the canonical resume sequence, previously
  inline in `ChatRoomClient`, now shared by every surface that continues a conversation.

- 2026-08-17 — The one-by-one rule review is now a wide, calm wizard instead of a narrow wall
  of text: the rule name and statement lead in a dedicated reading column, rationale and
  violation guidance have clearly separated labeled panels, the intrusive severity chip is
  gone, and the progress count has its own space away from the close control.
- 2026-08-17 — Added permanent compatibility redirects for every shipped Expertise URL:
  `/expertise` → `/masterwork`, `/expertise/[id]` → `/masterwork/[id]`,
  `/expertise/[id]/desks` → `/masterwork/[id]/masterworks`, and `/expertise/admin` →
  `/masterwork/admin`. The canonical namespace remains Masterwork-only; old bookmarks never
  dead-end.
- 2026-08-17 — **Encore shipped** (the Operator door): `/encore` + `/encore/[id]`, the
  draft→released lifecycle (`metadata.released_at`, Release/Un-release in the Studio with a
  guarded version CAS), Studio↔Encore doors both ways, per-Operator run history, nav entry.
  Also fixed: `TERMINAL_STATUSES` missed `errored`/`abandoned`, so a run that errored mid-run
  left TryMasterworkBox "Working…" forever; live Masterwork descriptions cleaned of retired
  vocabulary ("Compiled from Expertise Pack") and raw UUIDs (build.py no longer embeds the id).
- 2026-08-17 — **The review loop closes both ways** (Arman's feedback): Reject-with-feedback and
  Request-changes on every rule (`RuleFeedbackDialog`), rejected/change-requested badges + the
  feedback shown on the rule row, the Scout receives `open_feedback` from the `rulebook` tool
  read and its instructions require clearing it every turn (aidream
  `services/distillation/tools.py` + the `masterwork_scout` DB agent). Plus the focus review
  wizard (`RuleReviewWizard` — one rule at a time, approve/reject/edit/skip, auto-advance) and
  the gamified KPI strip (`RulebookKpiStrip` — approved/waiting/rejected counts, review-progress
  bar, next-step encouragement). All module textareas moved to `ProTextarea`.
- 2026-08-17 — **The Masterwork rename executed** (lexicon ruled 2026-08-16). Feature dir
  `features/expertise/` → `features/masterwork/`; canonical routes `/expertise*` →
  `/masterwork*` (the old namespace has permanent compatibility redirects only); components renamed (NewRulebookDialog,
  RulebookDetailPage, MasterworksPage, MasterworkDriftDialog, ScoutInterviewPanel,
  BuildMasterworkDialog, TryMasterworkBox, AuditionDialog, MasterworkStudioPage); types renamed
  (Rulebook/RulebookRule/Masterwork/…); DB contract moved to `platform.rulebook` (`rules`
  column), `platform.masterwork_run`, RPCs `rulebook_versions`/`rulebook_snapshot`; API prefix
  `/masterworks/*`; stream events `masterwork_*`; workflow metadata `built_from_rulebook` /
  `rulebook_slug` / `rulebook_version` / `masterwork_kind`; entity token `rulebook`; all ~90
  user-visible strings speak Rulebook / Masterwork / Build / Audition / Scout. Also fixed the
  intake name derivation to truncate on a word boundary (handoff defect #3).
- 2026-08-17 — Guided-start authoring fields now use the canonical `ProTextarea` / `ProInput`
  primitives.
- 2026-08-17 — **Refresh-fragility CLOSED (THE FLOATING LAW's durable half).** Both dialogs
  survive a reload via the durable run row (`platform.masterwork_run`), announced as the first
  stream event, heartbeated, rejoined with `POST /masterworks/runs/{run_id}/rejoin`. A dialog
  whose run is still going REOPENS ITSELF after a reload; a finished run's answer is restored
  from the row.
- 2026-08-16 — File/PDF/audio ingest Approach; RuleProvenance page anchors + doors; per-Masterwork
  recent-run history; TryMasterworkBox refresh rejoin; version snapshots + rule-level drift dialog.
- 2026-08-15 — The Distillation start: intake-first dialog (four questions → metadata.intake →
  Approach routing), Scout interview panel, empty state offers the interview first.
- 2026-08-10 — Feature created: list, detail rule editor, Masterworks page with drift flags,
  admin map, sidebar + entity registry wiring; Build + ingest dialogs.
