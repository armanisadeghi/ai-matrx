# Monitor setup — the tracker editor

Product truth: `common-docs/projects/outside-skill-packs/BRIEFS-STRATEGY-AND-ORG-CHART.md` §5 and
`NEWS-ENGINE-SPEC.md` §12 (Lane G). This file is local mechanics only.

**One editor for both lenses** (coverage: who writes about us; opportunity: news we can join), one record
(`seo.coverage_tracker`). Route: `/marketing/[brandId]/intelligence/monitoring/setup` (`?tracker=` edits,
`?site=` preselects the website) via `marketingRoutes.brandMonitorSetup`. Opened from the brand's Monitoring
front door ("News monitor" door) and from a site's Coverage tab ("Set up monitoring" / "Edit monitor").

| Piece | File | Path |
|---|---|---|
| Pure model: draft, proposal merge, count warnings, FNV-1a, brief markdown, declare body | `model.ts` (+ `model.test.ts`) | — |
| Server calls | `api.ts` | `GET /news/setup/facts`, `POST /news/setup/propose` (stream), `POST /coverage/trackers`, `GET/POST /coverage/trackers/{id}/schedule`, `POST /coverage/trackers/{id}/run` (stream) |
| Direct reads/writes (RLS) | `data.ts` | `seo.coverage_tracker`, `web.business_fact` (`kind` spokesperson / proof), `workbench.notes` (the brief → `brief_source_id`), `seo.coverage_mention` |
| Screen | `MonitorSetupEditor.tsx` | — |
| Every monitor + what its AI checks read | `inputs/` (`data.ts`, `NewsTrackersList.tsx`, `NewsTrackerInputsView.tsx`) | `/marketing/monitoring`, `/marketing/monitoring/[trackerId]`; doors `seo.news_tracker_inputs` (read, mirrors aidream `news/client_context.py`) and `seo.news_tracker_set_state` (pause / resume / archive, moves the `workflow.trigger` too) |

## Invariants

- **Nothing typed twice, nothing hard-coded.** Company fields come from the brand (read-only, "Edit in brand").
  Count ranges, schedule choices and default, X trend locations, the feed catalog and the cost inputs are knobs
  (`news.setup.*`, `news.feed_catalog`, `news.monthly_run_cost_ceiling_usd`) served by `GET /news/setup/facts`.
- **Every item shows its source.** Proposed items carry `basis` (chip: your site / your brand / named company /
  recent coverage); anything the person types is "you said it". Items the server dropped for lacking a basis are
  listed, never hidden.
- **Warn, never block.** Counts outside the knob ranges and an empty means line ("Wrong-company matches will get
  through") warn; the only refusals are the server's (access guard A1, lens requirements).
- **Every call names the brand's organization** (`scopeOverrides.organization_id`); nothing picks one.
- **Not built here yet:** alert recipients and the Slack vault picker (`POST /coverage/trackers/{id}/delivery`
  exists); the editor tells the person they are the recipient and shows the alerts promise.
