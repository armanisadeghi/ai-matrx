# Link Valuation Engine

**Status:** live at `/marketing/backlink-valuation` · engine verified against the source
spreadsheet · not yet persisted to the database · AI signal collection declared, not wired.

Scores a candidate backlink on site quality, topical relevance and negotiated placement, then
prices what it is worth paying and who may authorise that spend.

Converted from Arman's "Backlink Checker" Google Sheet (18 tabs, 6 functional) via a technical PRD
extracted in 2026-08. It is the first of a series of spreadsheet-system conversions; the prompt that
produces those PRDs is
[`common-docs/projects/spreadsheet-systems/EXTRACTION_PROMPT.md`](/Users/armanisadeghi/code/common-docs/projects/spreadsheet-systems/EXTRACTION_PROMPT.md).

---

## THE LAW OF THIS FEATURE: there are no numbers in the code

Every weight, band edge, slope, divisor, threshold, label boundary, dollar point, role multiplier
and gate lives in a `LinkValuationConfig` **value**. `engine.ts` contains no numeric literal that
affects a score. A new term, gate or signal becomes tunable in the UI the moment it is declared,
with no UI work — the tuning panel renders whatever the config says.

This is not a style preference. The whole reason to move these systems out of spreadsheets and
still keep them tunable is that the expertise lives in the numbers, and the numbers must stay
arguable.

## The other three invariants

- **Unmeasured is never zero.** A signal we could not source drops out of its group's weighted
  mean and lowers `confidence`. It never scores 0, because 0 means "measured, and worthless" — a
  different sentence, and the one that quietly mis-prices a link.
- **A signal is defined by its semantics, never by the vendor.** `SignalDef.semantic` / `scale` /
  `entity` are the contract a substitute must satisfy. An API, an AI estimate, and a human typing a
  number are interchangeable if they answer the same question on the same scale. This is what makes
  the model survive a vendor going away.
- **An AI-sourced signal names a MANDATE, never an agent and never a prompt.** Code names the job;
  the database decides which agent fulfils it. See the mandate keys in `configs/matrx-v1.ts`.

## Layout

| Path | What it is |
|---|---|
| `types.ts` | The config contract. Read this first. |
| `curves.ts` | Every transform the algorithm can apply. Pure, total, never returns NaN. |
| `engine.ts` | `evaluateLink(config, input)`. Pure — no DB, no network, no AI, no app imports. |
| `configs/sheet-2018.ts` | Exact reproduction of the original spreadsheet. The regression anchor. |
| `configs/matrx-v1.ts` | The redesigned model. This is the one meant to be tuned. |
| `storage.ts` | Config persistence (localStorage today) + import/export. |
| `components/` | Workspace, candidate form, result panel, tuning panel. |
| `__tests__/` | Parity against the source document's worked example + a render smoke test. |

## What changed from the 2018 sheet, and why

Each of these is a knob, not a rewrite — `sheet-2018` still reproduces the old behaviour exactly.

1. **Correlated inputs collapse into composites.** The original summed seven authority metrics as
   though they were seven independent opinions; 52% of a domain's positive points came from one
   fact measured seven ways. They are now members of one group averaged over whatever arrived, so an
   extra source raises confidence rather than score.
2. **Every signal normalises to 0–100 before weighting** — which is what makes a source swappable,
   and removes the index-size trap (global rank enters as a percentile, never a raw ordinal).
3. **Placement promises left the relevance score.** Social amplification and feature placement are
   things a publisher agreed to do, not facts about topical fit. In the source's own worked example
   they supplied 54% of the "relevance" number.
4. **Page authority left the relevance score** for the same reason — another 43% of that number.
   Between them, 97% of that example's "Relevance Score" came from non-relevance inputs, while both
   topical fields read "No Relevance".
5. **AI carries the judgements nobody could buy in 2018** — topical match, editorial quality,
   outbound-link hygiene, author credibility, link-selling risk.
6. **Hard gates exist.** §1.2 of the source promised bad domains were "rejected"; no tab
   implemented it.
7. **Band discontinuities are a knob.** The trust/volume curve jumped 100 points between a ratio of
   1.099 and 1.100. `smooth: true` interpolates them away.
8. **The 136-row value table is nine points.** Linear interpolation over them reproduces every
   published checkpoint exactly. Nine knobs instead of 136.

## Known limits — read before reporting this done

- **Not persisted.** Configs live in `localStorage`; evaluations are not stored at all. The config
  shape is still moving, and a table for a schema about to change is churn. When it settles:
  org-scoped table, config version stamped on every evaluation (auditability requires being able to
  explain a price quoted six months ago).
- **AI signals are declared, not wired.** The mandate keys in `configs/matrx-v1.ts` are not seeded,
  so those values are typed by hand today. Seeding them is the next build.
- **`matrx-v1`'s numbers are deliberate defaults, not calibrated ones.** Calibration needs a corpus
  of the owner's historical rulings — 30–50 domains scored in the sheet era, with their old scores.
  Until that exists, treat the outputs as ordinally useful and cardinally provisional.
- **Two source tables could not be reproduced** because the PRD documented them with ellipses: the
  "Round" quality/dollar table (§3.4b) and the relevance-bonus table (§3.4a). Quality labels
  therefore come from §3.5, which is complete. Getting those two tables verbatim closes the gap.
- **No outcome loop.** Nothing records whether a link was bought, at what price, whether it was
  placed, or whether it stuck. That is both the audit trail the original promised and the only
  corpus that would ever let these weights be re-derived from real decisions rather than intuition.
- **Roles are not real memberships.** Writer / Guest Post Manager / SEO Manager are config strings;
  they are not mapped to `iam` memberships and nothing enforces the ceilings.

## Change log

- **2026-08-18** — Built. Engine, both configs, workspace UI, 36 tests including exact parity with
  the source PRD's Appendix B worked example.
