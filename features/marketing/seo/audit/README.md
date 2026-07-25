# Page-audit evaluators — deterministic social / headings / indexability

Three deterministic evaluators over one capture of a page, each producing
facts + `ok` + `issues[{severity: error|warning, message}]`:

| Evaluator | File | Verdict |
|---|---|---|
| Social share card (OG + Twitter) | `social.ts` (`evaluateSocialCard`) | errors on missing title/image; warnings on description, card type, lengths (70/200), og:url/og:type, http:// images |
| Heading structure | `headings.ts` (`evaluateHeadingStructure` + `headingInputsFromRaw`) | errors on no headings / no H1; warnings on multiple H1s, non-H1 first, skipped levels, empty, >70 chars |
| Indexability | `indexability.ts` (`evaluateIndexability`) | `verdict: indexable \| check \| blocked` from HTTP status, robots (`noindex`/`nofollow`/`none`), canonical-vs-final (normalized), redirect hops |
| URL quality | `url-quality.ts` (`evaluateUrlQuality`) | warnings only (never blocks indexing): length >100, depth >4, uppercase, underscores, query params, #fragments, percent-encoding, double slashes |

## Cross-language parity — the law

EXACT mirror of aidream `packages/matrx-scraper/matrx_scraper/audit_metrics.py`
— logic, thresholds, URL normalization, AND issue strings are byte-identical.
Enforced by `audit.parity.test.ts` against Python-generated fixtures
(`__fixtures__/audit-parity.json`). Change either side → change both in the
same unit of work and regenerate the fixture.

**Feed the evaluators RAW wire shapes**, not display-parser output:
`socialInputFromRawTags(head_tags.og, head_tags.twitter)` and
`headingInputsFromRaw(headings.all)` mirror the Python input handling —
display parsers drop data the evaluators must see (e.g. empty headings).

## Persisted contract

`web.snapshot.audit_metrics` (v1) — stamped by the scraper on every capture;
the `url` section is ADDITIVE and optional (absent on payloads written before
2026-07-21) and is excluded from `overall_ok` because it is warnings-only;
consumers can always recompute it live from the page URL.
`buildStoredAuditMetrics` / `parseStoredAuditMetrics` in `stored.ts` build and
narrow the identical payload client-side. Contract doc:
`migrations/web_audit_metrics.sql`.

## Rendering

`AuditIssueList.tsx` is the canonical issues renderer (error = destructive,
warning = warning tone, optional success line, `compact` for embeds).
Consumers: marketing `PageWorkspace` (social section, indexability verdict
banner, headings outline flags), the Social Card Analyzer
(`features/marketing/seo/social/`), and the public `/seo/social-preview` tool.

Part of the **`section-canonicalization`** system — `features/marketing/seo/serp/` is
the founding reference; this directory is the second application of the
recipe.
