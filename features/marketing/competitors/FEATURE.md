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

## Change log

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
