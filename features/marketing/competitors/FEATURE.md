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
