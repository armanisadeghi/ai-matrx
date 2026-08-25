# Stream status — generated, never hand-maintained

`pnpm check:shapes:stream` replays every kind's registered example through the
REAL streaming pipeline (accumulator + kind route) and reports what a reader
would see. Laws checked: detected while streaming · kind resolved live · no
raw-JSON flash · completes as its kind · the real component renders live ·
the loader never returns once it does.

- kinds checked: **484** (active: 323)
- ACTIVE kinds failing at least one law: **13**

## Failures by law

| law | active kinds failing | examples |
| --- | --- | --- |
| `no-live-render` | 8 | claim_evidence, entity_mention, evidence_source, item_presentation, node_outcome |
| `did-not-complete-as-kind` | 5 | node_outcome, retrieved_chunk, scraped_page, serp_placement, source_ref |
| `kind-not-resolved-live` | 1 | dispatch_result |
