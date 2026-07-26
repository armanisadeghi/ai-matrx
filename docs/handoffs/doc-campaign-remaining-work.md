# Handoff — Doc-consolidation campaign: remaining work

**Status:** active. **Created 2026-07-26** at campaign close-out. Waves 1–5 are EXECUTED (see
`doc-consolidation-campaign.md` beside this file for the full record). This handoff is the
complete list of what remains — each item is independent; pick any.

## Needs Arman (decisions only he can make)

1. **`aidream/docs/knowledge/scope-{model,*}.md` (3 files)** — read as Arman-authored vision
   drafts; Wave 3 deliberately skipped them. Ruling: VISION (keep, never archive) or working
   drafts (archive into the scope-context SOR's history)?
2. **`aidream/docs/packages/PACKAGE_DOCTRINE.md`** — Arman working-session doctrine
   (2026-07-21); skipped as owner territory. Fold into matrx-package-template's INDEPENDENCE
   rules, promote to common-docs `/policies/`, or leave?
3. **ai-matrx `docs/WEB_SCHEMA_CANONICAL_REFERENCE.md` + `_REVIEW.md`** — cluster 6 proposed
   archiving them, but they're LIVE (edited 2026-07-19/20, load-bearing for the marketing admin
   page) and carry the 17-table `web` contract db-rules doesn't. Recommendation: rename/move
   under `features/marketing/` as the FE web-schema contract (dropping the CANONICAL title) and
   pointer to db-rules for the access model. Needs a yes.
4. **Cluster 8 — Secrets (4 claimants)** — reassigned to the security/permissions session; not
   this campaign's to execute. Tracked here so it isn't lost.

## Guard-violation backlog (mechanical, sizeable)

The new advisory guards (`pnpm check:docs-guards` in ai-matrx; `scripts/check_docs_guards.py`
in aidream, run inside release.sh) started at ~108 (ai-matrx) + ~83 (aidream) violations.

**Cleared by the 2026-07-26 docs-hygiene sweep:** all pointer-path violations in both repos
(19 → 0; canonical spelling is now `/Users/armanisadeghi/code/common-docs/<systems|projects|
policies|meta|skills>/...`), and ai-matrx's three root-level strays (archived to
`docs/archive/2026/` with banners). Counts now **93 (ai-matrx) + 76 (aidream)**.

**Remaining:**
- **Confident-title claimants** (93 ai-matrx + 70 aidream) that predate the policy — each needs
  demote-or-allowlist-with-reason. This is the bulk of the backlog.
- **aidream root-level strays** (6): ACCEPTANCE_DEV_SERVER, AUDIO_STREAMING,
  ENV_FLAG_ERADICATION, PERSISTENCE_AND_ERROR_HANDLING_BUGS, TASK-systemwide-error-tracking,
  audit_api_types. Unlike ai-matrx's, these have **live referrers** — CLAUDE.md, `.claude/skills/`,
  code comments, and CI (`audit_api_types.md` is written by `scripts/audit_api_types.py` and read by
  `.github/workflows/audit-api-types.yml`). Moving them means updating every referrer and the
  generator's output path in the same change; not a drive-by fix.

Then flip the guards from advisory to strict. The weekly `docs-hygiene` scheduled task chips at
this; a dedicated session could clear the confident-title bulk in one pass.

## Deferred / blocked small items

- **Uncovered repos** — the inventory never covered matrx-extend (most important: shared DB +
  its own CROSS_REPO_INTEGRATION.md ecosystem), matrx-local, my-matrx, matrx-ship,
  matrx-sandbox, matrx-package-template. Each needs the same inventory→file→archive pass.
- **`aidream/utils/code_context/`** — Wave 1 called it a byte-identical duplicate of the
  matrx-utils copy; it is NOT (files differ, live imports from `graph_actions/admin/dev.py`).
  Needs real dedup: reconcile the two copies, point imports at the package, then delete.
- **aidream `FOUND_DEFECTS.md` lines ~391/638** — cite pre-archive paths
  (`db/canonical_db.md` detail, `docs/scraper/SCRAPER_UNIFICATION_PLAN.md`); untouchable
  during the campaign per rules. Update the paths next time those defects are worked.
  Related: archived `SCRAPER_UNIFICATION_PLAN.md` backs an open defect — un-archive into
  `packages/matrx-scraper/` if that work resumes.
- **`.arman/junk/*` (3 files, aidream)** — Wave-1 approved but deferred when Arman said to
  stay out of `.arman/`. Delete whenever he confirms.
- **Empty dirs left by `git mv`** (`docs/ctx/`, `features/scope-system/docs/` in ai-matrx;
  `.agent/`, `docs/tasks-from-outside/` in aidream; `to-be-organized-NEW/` in common-docs) —
  `rmdir` was permission-blocked for agents; one manual sweep clears them. Also the archived
  duplicate `ctx-association-migration-analysis-brief (1).md` can be deleted outright.
- **Cursor-rescue follow-ups (Wave 4)** — 5 `.cursor` files kept with DEPRECATED headers hold
  unique homeless rules (auth-in-public-routes, app-builder redux contract, cmd+click
  navigation doctrine, feedback triage protocol ×2); promote each into its named target skill.
  Also: aidream `treasure-map-docs` (rescued from .cursor) overlaps `context-docs` in genre —
  merge or keep both deliberately.
- **`pip install pyyaml`** on the primary machine so `okf_lint.py` leaves degraded regex mode.
- **Scheduled task pre-approval** — `docs-hygiene-weekly` exists (Mondays 07:00). Click
  "Run now" once from the Scheduled sidebar to pre-approve its tools so unattended runs never
  stall on permission prompts.

## Where authority lives now (context for whoever picks this up)

Structure: common-docs = `systems/` (SOR) + `projects/` + `policies/` + `meta/` + `skills/`.
Doc types + authority ladder: common-docs `/policies/document-types.md`. Maintenance:
`docs-hygiene` skill (weekly scheduled). Rules for new cross-repo docs: `cross-repo-docs`
skill. The campaign doc beside this file is the full historical record.
