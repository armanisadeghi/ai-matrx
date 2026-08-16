# Competitor Opportunity Autopsy

Status: live. Route: `/marketing/competitors`.

This is a decision surface, not a competitor metric dashboard. A run discovers real
keyword-overlap competitors, finds and crawls their winning pages, compares those pages
to owned assets, incorporates backlink evidence and the existing Page Analyzer and
Page↔Keyword Mapper, then streams two pinned agent outputs through the canonical Content
IR execution path (`adoptForeignStream` → `LiveRunDisplay`). No component parses AI text.

## Data and work boundaries

- Reads go directly from the browser to RLS-protected `seo.competitor`,
  `seo.competitor_opportunity`, and `seo.collection_run`.
- Human lifecycle writes use the editor-gated SEO RPCs. Accept/Start/Complete/Dismiss and
  Track/Stop tracking are one-click actions; they never overwrite provider or AI evidence.
- Paid provider calls, crawling, owned-page analysis, agent work, and Content IR persistence
  go to aidream at `POST /seo/sites/{site_id}/competitor-autopsy`.
- The latest completed run's artifact supplies the executive verdict, evidence coverage,
  and limitations after the ephemeral stream disappears.

## UX contract

The page opens on the highest-value opportunities, not a setup wall. Automatic discovery
is the default; known domains are optional input. Bounds make cost visible. Opportunities,
competitors, and run history use the canonical `MatrxDataTable`, with sort and filter on
every data column, full record drawers/windows, real external doors for competitor pages,
canonical owned-page links, and row-level workflow actions. The Backlink Intelligence
competitor tab links here with the current site preselected. `AssistStrip` uses the
`matrx-user/marketing-competitors` surface, whose runtime scope includes the selected
site, loaded competitors and opportunities, latest persisted artifact, and active run.

Identification is equally primary: the user types a known business name, web lookup
returns likely official sites with external doors, and one click adds the selected
identity for classification. Proposed rows open a full axis editor for business overlap,
market overlap, entity role, posture, link-gap eligibility, and free-text custom labels.
The visible type is always `derivedCompetitorLabel(...)`; no stored type exists.

**AI and deterministic output are proposals.** Proposed rows emit canonical
`platform.assists` chips on this surface. Accepting the chip uses the declared
`competitor_classification` surface-write target and stamps human confirmation; the
table editor uses the same writer. Paid work may consume only confirmed rows.

## Ground truth — the Review tab

**System of record: `common-docs/systems/competitor-classification/FEATURE.md` §8d + §10.**
Read it before touching the brief, the ruling record, or the axes.

`/marketing/competitors` → **Review** is where a human's judgment becomes ground truth, and it
implements THE STAGED-CONFIDENCE PATTERN in the real product rather than in a separate admin
harness — his rulings are collected as a side effect of using the tool.

**The brief first, the rulings second.** `LandscapeBriefCard` shows what stage 1 established: what
the business is, the analyst's OWN 1-5 certainty, and the SERVICE LINES with a footprint each.
That last part is the load-bearing one — market overlap is a property of (service line ×
geography), so a national rival in one service line is not a competitor in another. The correction
box is free text on purpose: "I think it's more like 30 miles" is the training signal, and a form
field would destroy it. What he writes becomes `seo.landscape_brief.guidance`, which every later
agent receives as fact outranking its own inference.

🚨 **The deadline is a promise, not a wait.** A brief lapses to `auto_accepted` 24 hours after it
is generated and downstream work carries on with its assumptions — "the system doesn't wait around
for the user to accept it." Never write copy implying work is blocked on the reader, and never
build a stage that stalls on an unread approval. `reviewDeadlineNote()` owns that wording.

**The queue leads with our best work.** `GroundTruthQueue` sorts by the classifier's own
confidence, DESCENDING: leading with the most confident calls is what makes the first ruling cost a
second, and a correction on a high-confidence row is the most informative signal in the system.
Two buttons — Right, Wrong. **Never ask an abstract taxonomy question**; show a real domain from
their own search results and a plain sentence about it.

**What a ruling must capture** is defined once, in `groundTruth.ts`: the axes set, the label they
would have used, whether OUR proposal was right, and *in their words* why. The machine's proposal
is frozen BESIDE the ruling — without both versions "were we right?" is unanswerable. It lands in
`seo.competitor.human_ruling` with `classification_status='confirmed'`, never in a file.

**Find my competitors** calls `POST /seo/sites/{id}/competitors/discover` — discovery and
classification without buying a page-crawl autopsy. Everything lands `proposed`.

## Change log

- 2026-08-15 — Replaced the unprovable “Only you” privacy claim above the
  landscape-review questions with factual review copy; access is never inferred
  from a label or a single visibility column.

- 2026-08-15 — Added the Review tab: the landscape brief (staged confidence, service lines, 24h
  non-blocking deadline), the confidence-ordered ruling queue, and the ground-truth ruling record.
  The axis editor gained `peer_scale` and the live 15-value `entity_role` list — the pinned
  classifier agent's schema still enumerated the original 8, so the widened taxonomy was
  unreachable by the AI layer until v3.

- 2026-08-15 — Added first-class typed-name web lookup + one-click add, deterministic-first
  classification with the platform-agent fallback, assist-backed approvals, derived labels,
  editable axes/link-gap choice, and custom labels.

- 2026-08-11 — Claude: **the route this doc already claimed now exists.** `Status: live` was
  aspirational: `CompetitorAutopsyWorkspace` had no page anywhere and `/marketing/competitors`
  rendered `MarketingComingSoon`, so nothing here was reachable. The route now renders the
  workspace and the `marketing.competitors` coming-soon entry + nav flag are deleted. Live
  verification against production then found two backend defects that made every run fail after
  paying for provider work — competitor discovery requested the `COMPETITORS` capability, which
  makes the DataForSEO adapter demand a canonical normalizer `labs.google.competitors_domain`
  has never had, and the persisted row wrote `discovery_source='dataforseo'` against a check
  constraint that admits only `provider|declared|manual|backlink|serp`. Both fixed in aidream
  (`services/seo/competitor_autopsy.py`).
- 2026-08-11 — Claude: **the strategist agent could never finish, and the cap was the reason.** With the
  route finally reachable, the first complete runs failed at the last stage with "output missing
  required keys". The agent's schema was correct; its budget was not. `agent.definition_version.settings`
  carried `max_output_tokens: 16000` with `reasoning_effort: "high"` — the execution row shows
  `output_tokens: 16000` exactly, i.e. reasoning consumed the entire budget and the JSON was truncated
  before it closed, after spending $0.41. Raising the cap to 64000 traded one failure for another: the
  run was killed at exactly its 30-minute execution lease. Settled at `max_output_tokens: 32000` +
  `reasoning_effort: "medium"` (agent version 4; the `seo.competitor_opportunity_autopsy` slot is
  pinned with `use_latest: false`, so the slot's `default_agent_version_id` was repointed in the same
  change — bumping the agent alone would have changed nothing). **Both bounds are real:** too small
  truncates the artifact, too large exceeds the lease. A verified run on datadestruction.com now
  produces 3 competitors, 5 prioritized opportunities, and a 35% already-covered verdict.
- 2026-08-11 — Claude: **polish pass — six defects a paying user would have seen.** The autopsy hook
  fell back to the RAW stream kind for any unmapped event, so `seo.analyze_page_completed — complete`
  reached the screen; `STAGES` now covers every event the run can emit (nested `seo.analyze_page_*`
  from page_agents.py, the provider `_limited` events, and the durable-command envelope) and
  `stageLabel()` keeps the last human sentence rather than ever printing platform vocabulary. The
  `LiveRunDisplay` is mounted only while `status === "running"`: the strategist returns pure
  structured JSON, so the canonical renderer has nothing to draw and parks on its "Processing…"
  shimmer — left mounted, that sat under a finished "Autopsy complete" forever. Added the missing
  `PageHeader` (the route showed no title in the shell header) and centered the hero's left column
  against the taller run form.
