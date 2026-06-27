# DB Change Proposal — template

> Copy this for any DB change that is **multi-table, touches a production consumer, migrates data, or moves/retires a table.** Fill EVERY section from real evidence (run the discovery queries + `db-table-refs` helpers first — never guess). The goal: the reviewer can say **`go`** or request a change in one read, because every decision and every blast-radius fact is already on the page. Keep it tight; link evidence, don't paste file bodies. Save the filled copy to `docs/db_rebuild/proposals/<slug>.md`.

---

# DB Change Proposal — <title>

**One-liner:** <what changes + why, in one sentence>
**Change types:** canonicalize · move-schema · graveyard · drop · merge · modify *(list the ones that apply)*
**Status:** ⏳ awaiting GO

## 1. Scope — the cluster (every table in the blast radius)
A change is rarely one table. List them all, each with a verdict.
| Table | Rows | Verdict | Why |
|---|---|---|---|
| `<t>` | <n> | keep+canonicalize / move / migrate→retire / graveyard / leave | <one line> |

## 2. Outcome (before → after)
<2–4 lines: the end state, and the explicit promise that user-visible behavior is preserved.>

## 3. Usage reality — the repoint cost (evidence, not guesses)
- **FE (matrx-frontend):** N `.from()` calls across <files> · M `.rpc()` calls (`<names>`) · legacy-column reads (`<cols>`). *(from `db-table-refs.mjs`)*
- **Python (aidream):** models/managers · `package_integration.py` lines · version/other RPCs. *(from `db/table_refs.py`)*
- **matrx-extend / matrx-local:** impact (own tables? shared reads? pre-production?).
- **DB:** inbound FKs · RPCs · triggers · satellites · registry rows.

## 4. Plan — ordered, additive → cutover → retire
Number every step; tag each `[DB]`/`[FE]`/`[PY]`/`[EXT]` and `[reversible]`/`[gated]`. Show the exact toolkit calls / SQL shape. Phase it if the safe work and the risky work separate.
1. `[DB][reversible]` …
2. `[FE]` …
3. `[gated]` … (graveyard, not drop)

## 5. Data migration — lossless proof
<what moves where · row counts (source → target) · column mapping · how "no row lost" is verified (count equality, spot-check). If nothing moves, say "none.">

## 6. Decisions needed — **DECIDE** (each with a recommendation)
The reviewer answers these; everything else is pre-decided.
- **D1 — <question>?** options: A / B / C. **Recommend: <X>** — because <one line>.
- **D2 — …**

## 7. Acceptance gate (how we'll know it worked)
- `iam.verify_canonical(...)` expected: <zero FAIL + which WARNs remain/cleared>.
- Count checks: <source/target row equality, 0 nulls, etc.>.
- Real-user test: impersonate + read (RLS didn't hide data).
- `pnpm sync-types` clean · `python run.py` clean boot.

## 8. Reversibility & data-loss guards
<graveyard-not-drop · PITR confirmed before any hard drop · count snapshots before/after · what the rollback is at each phase.>

## 9. Out of scope / deferred (explicit)
<what this change deliberately does NOT do, so nobody assumes it did — list the litter/columns/tables left for later and why.>

## 10. Cross-repo finalize + docs
`pnpm db-types` (+ schema added if new) → repoint FE → `pnpm sync-types`. `python db/generate.py` (+ `matrx_orm.yaml` + `package_integration.py`) → `detect_applied.py` → `run.py`. Update matrx-extend/-local if referenced. Commit + push `main` both repos. Update `FEATURE.md` + `CHANGEOVER_PROGRESS.md`.

---
**Reply `go` to execute, or tell me what to change.**
