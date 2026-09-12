#!/usr/bin/env bash
# run-release-gates.sh — Quality checks around a release (formerly pre-commit).
#
# Runs doctrine, UI primitives, migration ledger, and dead-relations checks.
# Each gate announces itself before it starts — no silent spinner hiding a
# 60s+ wait. On pass: one OK line. On warn/fail: the check's own report.
#
# ADVISORY BY DESIGN, IN EVERY LANE. Arman's standing ruling: "the screaming is
# very real and you need to fix them, but it's not a reason to stop the code from
# going live." A red here is a WORK ITEM, never a brake.
#
# NOTHING AUTOMATIC RUNS THIS SCRIPT IN --strict. `scripts/release.sh` invokes it
# `--advisory || true`, and `.github/workflows/ci.yml` does not invoke it at all
# — CI runs a hand-picked subset of `check:*` scripts directly, and THOSE are the
# only ones that actually stop a merge. So --strict is a HUMAN tool: run it to
# make findings exit non-zero for your own triage. Calling a gate below
# "blocking" means only "exits 1 under --strict"; it does not mean a red stops a
# merge or a deploy, because no automation consumes that exit code.
#
# Usage:
#   ./scripts/run-release-gates.sh            # advisory — scream, never block
#   ./scripts/run-release-gates.sh --strict   # exit 1 on findings (manual triage)
#   ./scripts/run-release-gates.sh --advisory # explicit alias of the default
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

STRICT=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --strict) STRICT=true; shift ;;
        --advisory) STRICT=false; shift ;;
        -h|--help)
            grep '^#' "$0" | head -16 | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown flag: $1" >&2; exit 2 ;;
    esac
done

if $STRICT; then
    declare -a GATES=(
        # EVERY FILE PARSES — the cheapest gate here (~4s over 14,716 files)
        # and the only one whose finding is not an opinion. On 2026-09-07 the
        # census-H1 codemod injected its new `@ai-matrx/kit/format` import
        # INSIDE seven multi-line `import {` statements; the shared dev server
        # answered 500 on every route, for every agent in the checkout, until
        # someone traced it by hand (repaired in fc9a28a26f). `pnpm type-check`
        # DOES see it — as TS1003/1005/1128 — but it takes minutes, carries a
        # large tracked backlog, is advisory by standing ruling, and nothing
        # ran it between the codemod and the push. This runs FIRST because a
        # tree that does not parse makes every gate below it meaningless.
        # Zero findings at introduction and no lawful exception, so the script
        # itself exits 1 in both lanes — there is no `--advisory` on the
        # command below, unlike the gates that carry a backlog. (The non-strict
        # RUNNER still exits 0 overall, per this file's header; the hard stop
        # for this class lives in scripts/release.sh, pre-push.)
        # `pnpm check:parse --fix` repairs the injected-import class;
        # `pnpm check:parse:self-test` proves the guard can still fail.
        "Every TypeScript file parses|pnpm check:parse"
        # First, cheapest, and the one local tsc can't see: the COMMITTED tree
        # must resolve every import — a tracked file importing an untracked one
        # builds locally and dies on Vercel (v0.4.194, 2026-07-28).
        "Untracked-import breakage|bash scripts/check-untracked-imports.sh"
        "Parked route groups (a group deleted from main)|pnpm check:parked-routes:strict"
        "Cross-deployment links (a CORS preflight on every www hover)|pnpm check:cross-deployment-links:strict"
        "Agent addresses (a system agent linked into the user shell)|pnpm check:agent-links"
        "TypeScript type-check|pnpm type-check"
        "Doctrine check|pnpm exec tsx scripts/check-doctrine.ts --strict"
        "Doc claims vs live config|pnpm exec tsx scripts/check-doc-claims.ts --strict"
        "Route metadata and favicons|pnpm check:route-metadata:strict"
        "Pattern Patrol manifest contracts|pnpm exec tsx scripts/pattern-patrol/check-manifest.ts --repo-only"
        "Turbopack filesystem tracing|pnpm exec tsx scripts/check-turbopack-fs-tracing.ts"
        # BROWSER DIALOGS exit 1 under --strict. Zero findings at introduction
        # (2026-09-11) and no lawful exception, so there is no backlog to
        # grandfather. eslint.config.mjs has carried `no-alert` /
        # `no-restricted-globals` / `no-restricted-properties` for these forms
        # since 2026-08-12, but `pnpm lint` runs in neither CI nor this script,
        # so until now the ban was an IDE squiggle with nothing behind it. The
        # cost of a leak is not style: a native confirm() raised from inside an
        # open Radix Dialog cannot render (the dialog holds body pointer-events
        # at none), so the button reads as dead and writes nothing — the class
        # feedback 11b0a90c reported live on the provider-sync policy dialog.
        # `pnpm check:browser-dialogs:self-test` proves the guard can still fail.
        "Browser dialogs (window.confirm/alert/prompt)|pnpm check:browser-dialogs:strict"
        # A toast that NAMES a record must carry that record's identity
        # (`recordToast`, lib/toast.ts). Sonner pauses every dismiss timer while
        # document.hidden is true, so a bare record-naming toast can sit on
        # screen after the SPA navigated to a different record, or after that
        # record was renamed or deleted — a screen stating a false sentence.
        # Baselined at the existing population, so this only refuses NEW ones.
        # `pnpm check:record-toasts:self-test` proves the guard can still fail.
        "Record-naming toasts carry their record|pnpm check:record-toasts:strict"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts --strict"
        "Canonical agent/model pickers|pnpm check:canonical-pickers"
        "Archived-items law (every list has an archive control)|pnpm check:archived-items-law"
        "One agent-list read (package-owned)|pnpm check:agent-list-reads"
        "One \"is this run over?\" predicate (runIsOver)|pnpm check:run-is-over"
        "Scroll-chain (clipped tables/lists)|pnpm exec tsx scripts/check-scroll-chain.ts --strict"
        # Desktop-only geometry that never reflows on a phone: fixed-width
        # hand-rolled tables with no phone-stack/mobileCards twin, h-screen/vh,
        # ≥3-column dialog grids. The class behind the 2026-09-12 feedback-
        # console report. `pnpm check:phone-layout:self-test` proves it can fail.
        "Phone layout (tables, viewport units, dialog grids)|pnpm check:phone-layout:strict"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts --strict"
        # CANONICAL RATCHETS — the two counts from the 2026-08-15 architecture
        # drift audit's enforcement recommendation (item 2). Both read ONE cached
        # snapshot (public.canonical_ratchet_snapshot, ~0.7s; they never run
        # audit.refresh() on the hot path) and fail only when the live count
        # EXCEEDS a committed baseline. A new entity-like table born
        # unregistered, or a post-2026-08-12 table born non-conformant, exits 1
        # under --strict; the legacy backlog stays a queue and never fails.
        # No automation reads that exit code (see the header) — a red here is a
        # work item someone must pick up, not a stopped release.
        # Contract + baselines: scripts/canonical-ratchets/FEATURE.md.
        "Unregistered entity-like tables (ratchet)|pnpm exec tsx scripts/canonical-ratchets/check-unregistered-entities.ts --strict"
        "Post-doctrine conformance (ratchet)|pnpm exec tsx scripts/canonical-ratchets/check-post-doctrine-conformance.ts --strict"
        # NO NULL ORG exits 1 under --strict. Owner ruling 2026-08-21 (db-rules
        # §2/§6e) — and note the ruling asks for a SCREAM, not a brake:
        # "If something belongs to the system, that CANNOT EVER be represented
        # by a NULL org! ... make the release script scream ... NO NULL ORG."
        # Two ratchets on one ~1s snapshot: NULL-org ROW count (may only go
        # down) and the SET of tables that still allow a nullable
        # organization_id (may only shrink). Both seeded from live, so the 38
        # grandfathered tables and their 21,800 legacy rows are a queue and
        # cannot block anything — only GROWTH fails. The DDL half of the same
        # ruling is platform._ddl_guard lane (e), which RAISEs at CREATE time;
        # this gate also fails if that event trigger is missing or disabled,
        # because then nothing is watching the door.
        "NO NULL ORG (ratchet)|pnpm exec tsx scripts/canonical-ratchets/check-org-null.ts --strict"
        # REACHABILITY GUARDS. Two halves, one script. Definition parity
        # (containment_edges deps vs the trigger UPDATE OF list) is a
        # catalog-only, deterministic, one-right-answer check and BLOCKS in
        # strict — a forgotten column silently rots the access cache with no
        # symptom (drift audit 2026-08-15, finding 8 risk 1). Cache drift is
        # a full re-derivation: the script prints it loudly and exits 0
        # without --strict, because the fix is a rebuild + a filed defect,
        # not a blocked release.
        "Reachability standing guards|pnpm check:reachability-guards"
        # DB GUARD LIVENESS exits 1 under --strict. A guard's function body proves nothing —
        # `pg_event_trigger` is the only proof one is live (db-rules §1), and a
        # project restore drops event triggers SILENTLY because CREATE EVENT
        # TRIGGER needs superuser. That already happened: from the changeover
        # until 2026-08-20 all five platform guards existed as functions and NONE
        # was bound, so the registry's text columns rotted for weeks with nothing
        # erroring. Since 2026-08-21 `ddl_guard` also hard-ERRORs on hand-rolled
        # entity tables, so a silently-dropped binding now also un-does that
        # block. Missing OR disabled both fail: the escape hatch is DISABLE and
        # re-ENABLE inside ONE transaction, so a guard left disabled at rest is a
        # mistake, not a state. (aidream/scripts/release.sh asserts the same.)
        "DB guards: triggers, planner traps, public exposure|pnpm check:db-guards:strict"
        # HR PUNCH WRITE PATH is BLOCKING in strict mode, because RLS does NOT
        # prevent the insert: hr.punch is a `component` table whose write policy
        # admits anyone holding editor on the parent, so a client-direct
        # `insert into hr.punch` would manufacture a raw time record that passed
        # none of hr.punch_record's invariants. What actually holds the door is
        # structural and live-only — hr absent from PostgREST's exposed schemas,
        # zero anon table grants, an enumerated set of sanctioned writers, pinned
        # search_paths — none of which tsc or a code review can see. SPEC-TIME §15
        # called wiring this query into CI, rather than leaving it a review
        # checklist line, the only thing standing between us and that insert path.
        # All 9 checks are green with no backlog to grandfather. An unreachable DB
        # or an empty/short result prints LIVE PULL FAILED and counts as a finding,
        # never as a pass. (SPEC-DATA-MODEL §18.5 / L3-80.)
        "HR punch write path (client-direct insert into hr.punch)|pnpm check:hr-punch-write-path:strict"
        # PARTITION RUNWAY stays ADVISORY even in strict mode. It is the only
        # gate whose subject is the CALENDAR, not the code: a release that has
        # nothing to do with history.row_versions must not be blocked because a
        # partition expires in seven weeks. It screams; a human provisions.
        # (D122 — four days of lost writes; scripts/partition-runway/FEATURE.md.)
        "Partition runway (time-bounded DDL)|pnpm check:partition-runway"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts --strict"
        "URL identity twins (TS vs Python)|pnpm exec tsx scripts/check-url-identity.ts"
        "API contract ratchet|pnpm exec tsx scripts/check-api-contracts.ts --strict"
        "Backend boundary approvals|pnpm exec tsx scripts/check-backend-boundaries.ts --strict"
        "Scraper single transport boundary|pnpm check:scraper-routing"
        "Authentication destinations and gates|pnpm check:auth-destinations"
        "Auth doors blind to a split cookie jar|pnpm check:split-jar-doors:strict"
        "Package logic re-grown outside its package|pnpm check:package-twins:strict"
        "A doc or skill teaches a hand-rolled recipe the package owns|pnpm check:docs-twins"
        "Surface manifest drift|pnpm exec tsx scripts/check-surface-drift.ts"
        # Blast radius of the surface VALUE vocabulary: orphan agent bindings /
        # shortcut mappings / write twins, values a sync would delete out from
        # under a consumer, and children shadowing a parent's value. Advisory —
        # it reads the LIVE DB and must never block a release when creds or the
        # network are missing (it exits 3 and says so).
        "Surface value blast radius|pnpm exec tsx scripts/check-surface-impact.ts"
        # Every `writeTargets` entry a manifest DECLARES must have a handler
        # some mount REGISTERS. The two halves live in different files and
        # nothing links them at build time, so a gap is invisible until APPLY
        # time — after the agent planned a turn around the target and the user
        # approved the write. Static (AST over the three registration seams),
        # no credentials, ~10s. ADVISORY in both lanes: a finding is a page to
        # wire, never a stopped release. `pnpm check:surface-write-handlers:self-test`
        # proves the guard can still fail.
        "Surface write targets without a handler|pnpm check:surface-write-handlers"
        "Admin dashboard catalog|pnpm exec tsx scripts/check-admin-catalog.ts --strict"
        "Entity registry generation drift|pnpm check:entity-types"
        # --live pulls the deployed agx_sync_linked_agents() and diffs the TS
        # list against it. If the DB is unreachable it screams and falls back to
        # the committed snapshot rather than failing the release — and because
        # "LIVE PULL FAILED" / "COMMITTED SNAPSHOT IS STALE" are in run_gate's
        # advisory-marker list, that degraded run prints as [WARN] with the full
        # banner instead of a silent green [OK].
        "Agent sync fields vs live RPC (snapshot fallback)|pnpm exec tsx scripts/check-agent-sync-fields.ts --live --strict"
        "Access guard check|pnpm exec tsx scripts/check-access-guards.ts --strict"
        "Visibility vocabulary|pnpm exec tsx scripts/check-visibility-vocab.ts --strict"
        # THE COMPONENT OWNERSHIP LAW exits 1 in strict mode, unlike most
        # drift gates here. Its live count is 0 today (191 component tables, 945
        # policies) and must STAY 0 — a single regenerated component policy that
        # mentions created_by re-opens D182(3), where a parent-editor stamps
        # another user as creator and hands them owner-read. There is no backlog
        # to grandfather and no legitimate exception, so it never earns an
        # advisory carve-out. (db-rules FEATURE.md §6d-1.)
        "Component ownership law (no created_by)|pnpm check:component-created-by:strict"
        "Protocol mirror sync (aidream)|pnpm exec tsx scripts/check-protocol-sync.ts --strict"
        # A postgres_changes binding on a table that is NOT in the
        # supabase_realtime publication joins, says SUBSCRIBED, and delivers
        # nothing, silently, forever. Four instances shipped (workbench.notes
        # cost real user data; Meet was silent from launch). Resolves every
        # binding through the TS AST in BOTH repos and diffs against live
        # pg_publication_tables — anything it cannot resolve FAILS as
        # UNRESOLVED. Zero backlog by construction, so it exits 1 in both lanes;
        # no creds or no aidream checkout prints LIVE PULL FAILED (a marker
        # run_gate knows) and exits 2 as UNMEASURED, never a quiet green.
        "Subscribed tables in supabase_realtime|pnpm check:realtime-publication"
        # The kind loading-component slug list lives in the frontend (compiled
        # in, so the skeleton paints with zero latency) and is mirrored by
        # aidream's kind_create. A slug on one side only is invisible until a
        # built kind renders the generic skeleton forever.
        "Kind loading-slug twin (aidream)|pnpm exec tsx scripts/check-loading-slug-twin.ts --strict"
        # CONTENT IR / KINDS — the two halves of the kinds program's frontend
        # gate (KINDS_EVERYWHERE_PLAN.md §6.4). The surface export regenerates
        # the compiled detector table from live content_ir.kind_surface and
        # diffs it against BOTH committed twins (this repo's .generated.ts and
        # aidream's kind_surfaces_generated.py), so it catches registry drift
        # and cross-runtime drift in one run; it needs the live DB and fails
        # loudly rather than falling back, by design. The aidream half is
        # enforced by that repo's `kinds-parity` / `kinds-registry-drift` CI
        # jobs; this is where the frontend half is enforced, because this repo
        # deliberately has no commit-time hook and no CI (CLAUDE.md).
        "Kind-surface detector table vs live registry|pnpm check:shapes:surfaces"
        # DANGLING kind_component KEYS: an ACTIVE source='bundled' web/output row
        # may name a component `resolveBlockDispatch` (block-dispatch.tsx) does
        # not have, and NOTHING catches it at runtime — every kind carrying a
        # `legacyBlockType` facet routes through the compiled bridge regardless,
        # so the block renders while the registry advertises a component that
        # does not exist (proven 2026-08-23 by sabotaging `rating`'s row: the
        # render did not move). BLOCKING in both modes: the live backlog is ZERO
        # and the fix is either registering the key or repairing the row. This is
        # the ONE red code from the shape doctor that gates (`--gate=`); the full
        # `check:shapes:strict` report carries a large tracked backlog and stays
        # out of the gates. source='db' rows and `generic_structured` are exempt.
        "Dangling kind_component keys|pnpm check:shapes:components"
        # GENERATED KIND TYPES are the fourth consumer surface (conversion-
        # campaigns.md Law 2 §4): a stale `.gen.ts` COMPILES FINE AND LIES. The
        # generator reads content_ir.kind_definition.emitted_json_schema live and
        # diffs it against every committed file in
        # features/content-ir/kinds/generated/, so a re-seed or an activation
        # (which bumps `version`) can no longer stale the types in silence. It was
        # run BY HAND until 2026-08-23 — nothing invoked it, which is exactly the
        # discipline-instead-of-guard failure the policy names. BLOCKING in strict:
        # the drift count is 0 over 12 files with no backlog to grandfather, and
        # the fix is one command (`pnpm shape:types <kind>`), never an edit to a
        # .gen.ts. Needs the live registry, like its two neighbours here.
        "Generated kind types vs live registry|pnpm check:kind-types"
        # THE `__kind` MARKER LAW genuinely blocks a MERGE — ci.yml runs
        # `pnpm check:kind-marker-law` on every push and PR, so unlike most gates
        # here a red really does stop something. It exits 1 in both modes. `__kind` is part of
        # the data (KINDS_EVERYWHERE_PLAN §4.2); the 2026-08-23 annihilation left
        # ZERO violations and a small, reason-carrying blessed list, so there is
        # no backlog to grandfather. A new stripper is how stored examples and
        # instances lost their identity in the first place — it never earns an
        # advisory carve-out. `pnpm check:kind-marker-law --list` explains every
        # lawful door.
        "The __kind marker law (no stripping)|pnpm check:kind-marker-law"
        # Menu-section naming law (2026-09-10): a `use*MenuSection` that calls no
        # React hook lies to the hook linter and forces callers into hook
        # position; a `build*MenuSection` that calls one escapes it. Zero
        # violations at introduction (9 builders renamed), so a finding is new.
        "Menu-section naming law (use* = hooks, build* = pure, no bare *MenuSection)|pnpm check:menu-naming"
        # THE LIVE-ITEM LAW (2026-09-11): a menu item that looks clickable and
        # cannot act — no handler, an empty handler, `href: ""`, an empty
        # submenu. The wrapper grade above it only ever checked plumbing props,
        # so "no dead controls" read as certified when it had only been walked
        # by hand. Two real violations found and fixed at introduction, so the
        # tree is at zero and a finding is new.
        "Menu items that cannot act (THE LIVE-ITEM LAW)|pnpm check:menu-live-items"
        # autoRun is a UI control; a mode that paints no interface has nothing
        # for it to control, so `autoRun: false` there deletes the run instead
        # of deferring it. Zero violations at introduction (2026-08-25) and one
        # measured victim before it (image-studio DESCRIBE never ran), so there
        # is no backlog to grandfather — a finding is new, and it is a run the
        # user will never get.
        "autoRun never paired with a headless mode|pnpm check:autorun-headless"
        "Agent submission never requires typed user_input|pnpm check:agent-submit-content"
        "Content IR / kinds test suite|pnpm test:content-ir"
        # THE WHOLE JEST SUITE. `package.json`'s `"test"` script was invoked by
        # NOTHING — not CI, not this file, not a hook. CI runs four hand-picked
        # jest scopes (test:content-ir, test:render-matrix, test:workflow-runtime,
        # and two named HR files), so every suite outside them could rot in
        # silence, and 32 of them had: an accidental unscoped `pnpm test` on
        # 2026-09-08 found 32 red suites / 56 red tests that nothing had run in
        # months (FOUND_DEFECTS, that date). A suite nothing runs is not a test,
        # so the ship path runs all of them. 221s over 1,257 suites on a warm
        # checkout — the same order as `type-check`, which is already here.
        # Zero red at introduction (2026-09-09), so there is no backlog to
        # grandfather and it carries no `--advisory`: a finding here is new.
        "Whole jest suite (every suite, not CI's four scopes)|pnpm test"
        # THE LIVE REGISTRY vs THE COMMITTED SNAPSHOT. Same class, same day:
        # `check:shareable-registry` existed and nothing invoked it either, so
        # the snapshot drifted 31 rows behind the live
        # platform.shareable_resource_registry while registry.parity.test.ts —
        # which only ever compares the TS mirror to that snapshot — stayed
        # green on a stale reference. That blind spot is documented in the test
        # itself; this is the invocation that closes it.
        "Shareable registry: live DB vs committed snapshot|pnpm check:shareable-registry"
        # Docs guards went STRICT 2026-08-15 (guards-advisory-to-strict): both
        # repos reached zero violations, so a finding here is new drift, not
        # backlog. Allowlist additions go through scripts/docs-guards/ via PR.
        "Docs guards (titles/root-md/pointers)|pnpm exec tsx scripts/check-docs-guards.ts"
        # EVERY PICKER TAKES NEW INPUT (P13). Advisory in both modes: it carries a
        # standing backlog, and each remaining one needs its vocabulary's canonical
        # creator found FIRST — a second write path is worse than the dead end it
        # replaces, so this must never be rushed by a release.
        # Recipe: .claude/skills/picker-custom-entry/SKILL.md
        "Pickers that take new input (P13)|pnpm check:picker-add"
        # NO DEAD ENDS stays ADVISORY even in strict mode. The tree carries a
        # known Door Law backlog (scoreboard: /administration/reporting/dead-ends,
        # worklist: docs/handoffs/no-dead-ends-sweep.md); hard-failing on it would
        # block every release until the campaign lands. Promote to --strict when
        # the scoreboard reaches zero.
        "No dead ends (Door Law)|pnpm exec tsx scripts/dead-ends/check-dead-ends.ts --limit=15"
        # UNWIRED WORK stays ADVISORY even in strict mode. A finding means a
        # previous builder was interrupted and the runtime seam must be FINISHED;
        # the standing backlog may never block an unrelated release.
        "Unwired work (finish purpose-built artifacts)|pnpm exec tsx scripts/unwired/check-unwired.ts --limit=15"
        # SHARED SKILLS stays ADVISORY in both modes: cross-repo skills are
        # mirrored into every repo on purpose (a one-repo sandbox cannot follow
        # a symlink into common-docs), and the sibling bundle may not be checked
        # out here. It screams; it never blocks a release.
        "Cross-repo skills in sync with common-docs|pnpm exec tsx scripts/check-shared-skills.ts"
        # SKILL DESCRIPTIONS: a local SKILL.md description over 500 chars (not
        # allowlisted) or over 1,024 falls out of the budget-capped skill listing
        # and never auto-triggers. Fails strict on a real violation; skips loudly
        # when the sibling common-docs bundle is not checked out.
        "Skill descriptions fit the listing budget|pnpm exec tsx scripts/check-skill-descriptions.ts"
        # ACCESS ERRORS stays ADVISORY in both modes, same reasoning as the Door
        # Law above: the primitive (features/access-gate) shipped 2026-08-11 with
        # a known ~540-surface conversion backlog behind it. Hard-failing would
        # block every release until that sweep lands. Promote to --strict when
        # the count reaches zero.
        "Access errors (surfaces that guess why a read failed)|pnpm exec tsx scripts/access-errors/check-access-errors.ts"
        # MEDIA DURABILITY stays ADVISORY in both modes. It reports a stored
        # expiring URL only where the consumer contract demands durability
        # (anon-visible share projections + guard-registered columns); the one
        # open item needs a publish decision from Arman, not a code fix, so
        # hard-failing would block every release on a question no agent may answer.
        "Media durability (mismatch class)|pnpm check:media-durability"
        # HARDCODED AGENT DEFINITIONS — an agent's prompt/persona living in this
        # repo instead of the DB (Arman, 2026-08-16: the codebase is the
        # CONNECTION, never the definition). Advisory in both modes; the
        # allowlist is a reason-required ratchet whose count only goes down.
        "URL state written outside the canonical primitive|pnpm check:url-state"
        "Retired-database project id handed to agents|pnpm check:retired-db-ref"
        # HR TIME & ATTENDANCE — NO CLIENT COMPUTES HOURS (SPEC-TIME §9.2, L3-75).
        # Exits 1 on --strict, deliberately: the lane is greenfield and stands at
        # ZERO findings today, so a strict gate stalls nobody and catches the first
        # regression. Subtracting ended_at − started_at in a browser returns 8 hours
        # for a spring-forward night shift that was 7 (fixture OT-DST-01).
        # Falsifiability proven 2026-08-27: a planted known-bad line reported both
        # findings and --strict exited 1.
        "HR time: client-side hours arithmetic|pnpm check:hr-time-arithmetic:strict"
        "Hardcoded agent definitions (prompts in code)|pnpm check:hardcoded-prompts"
        # HARDCODED AGENT IDS — the same law spelled as a raw UUID (ROLLOUT.md
        # row X4). Baseline ratchet: exits 1 only on a NEW site; advisory here.
        "Hardcoded agent ids (raw agent UUIDs in code)|pnpm check:hardcoded-agents"
        # HAND-TYPED MANDATE KEYS — the same law spelled as a string literal.
        # @ai-matrx/agents 0.10.0 publishes the key set; a literal is a mirror of
        # it, and a rename or retirement on the server becomes a 404 nobody sees.
        # No baseline: the tree was brought to zero on adoption (2026-09-10, 200
        # literals across 76 files), so any finding is NEW.
        "Hand-typed mandate keys (vocabulary not adopted)|pnpm check:mandate-keys"
        # THE DISCLOSURE LAW (Arman, 2026-08-25) — a surface that RUNS an agent
        # registers its fixed jobs in the top Agents menu. Advisory: backlog is 40
        # surfaces deep and a release must not stall on someone else's page.
        "Surfaces running an agent without naming it|pnpm check:agent-disclosure"
        # DDL GUARD LOG — the reader the sentinel never had. Advisory in BOTH
        # modes: the guard's own WARN lane is advisory, and a release that never
        # touches the database must not be blocked because someone else's ALTER
        # TABLE tripped a WARN. Findings are acknowledged WITH A REASON via
        # platform.ddl_guard_ack(); triage is the docs-steward daily step.
        # (2026-08-15 drift audit §1; adjudicated + built 2026-08-21.)
        "Unacknowledged DDL guard firings|pnpm check:ddl-guard-log"
        # TYPE-ESCAPE RATCHET stays ADVISORY even in strict mode (no --strict on
        # the command), per Arman's standing rule: scream, never block the build.
        # It is listed here because NOTHING else runs it — no CI, no pre-commit
        # hook — which is exactly how ~1,200 hatches landed unfrozen between
        # 2026-07-02 and 2026-08-14 and the ratchet stopped ratcheting (D136).
        "Type-escape hatch ratchet|pnpm check:hatches"
        # Generated API types are boundary authority. Existing handwritten
        # shadows are baselined by declaration; any NEW shadow hard-fails the
        # strict lane, while direct generated aliases remain legal.
        "Generated API type shadow ratchet|pnpm check:generated-contracts"
        # THE GENERATED FILES THEMSELVES ARE FRESH — the only guard that sees a
        # HAND EDIT. `sync-types` and its drop guard watch a REGENERATION; commit
        # 4c827d5530 (2026-09-12) never ran one — it deleted
        # DirectiveConfirmRequest.conversation_id straight out of api-types.ts
        # along with the client code that read it, and every gate here stayed
        # green while a second Approve wrote a second project (DD-128). This
        # re-emits the contract from ../aidream and compares (~2-3 min), so it is
        # ADVISORY in both lanes: it also goes red, correctly, whenever that
        # checkout has simply moved ahead of the committed files, and the remedy
        # is the same either way — `pnpm sync-types`.
        # `pnpm check:api-types-fresh:self-test` proves it can still fail.
        "Generated API types are fresh, not hand-edited|pnpm check:api-types-fresh"
        # UNIFIED SETTINGS PLATFORM — five guards for ONE defect class: a
        # settings screen that accepts a value the system does not honour
        # (common-docs/projects/unified-settings-platform/REGISTER.md). Orphans
        # and ladder-ui carry a real tracked backlog (registry rows seeded ahead
        # of their consumers; sub-org rungs the universal UI does not address
        # yet), so they are advisory in both lanes; unregistered + env-toggles
        # also run in CI. Every one exits 2 UNMEASURED when it cannot read the
        # live registry — never a warn that reads as a pass.
        "Settings: registry rows no code reads|pnpm check:settings-orphans"
        "Settings: knob reads with no registry row|pnpm check:settings-unregistered"
        "Settings: NEW knob-shaped constants (ratchet)|pnpm check:settings-hardcoded"
        "Settings: behavioural env toggles (ratchet)|pnpm check:settings-env-toggles"
        "Settings: every rung reachable in the universal UI|pnpm check:settings-ladder-ui"
    )
else
    # Non-strict variants still print the full loud report; they exit 0.
    declare -a GATES=(
        # EVERY FILE PARSES — the cheapest gate here (~4s over 14,716 files)
        # and the only one whose finding is not an opinion. On 2026-09-07 the
        # census-H1 codemod injected its new `@ai-matrx/kit/format` import
        # INSIDE seven multi-line `import {` statements; the shared dev server
        # answered 500 on every route, for every agent in the checkout, until
        # someone traced it by hand (repaired in fc9a28a26f). `pnpm type-check`
        # DOES see it — as TS1003/1005/1128 — but it takes minutes, carries a
        # large tracked backlog, is advisory by standing ruling, and nothing
        # ran it between the codemod and the push. This runs FIRST because a
        # tree that does not parse makes every gate below it meaningless.
        # Zero findings at introduction and no lawful exception, so the script
        # itself exits 1 in both lanes — there is no `--advisory` on the
        # command below, unlike the gates that carry a backlog. (The non-strict
        # RUNNER still exits 0 overall, per this file's header; the hard stop
        # for this class lives in scripts/release.sh, pre-push.)
        # `pnpm check:parse --fix` repairs the injected-import class;
        # `pnpm check:parse:self-test` proves the guard can still fail.
        "Every TypeScript file parses|pnpm check:parse"
        # First, cheapest, and the one local tsc can't see: the COMMITTED tree
        # must resolve every import — a tracked file importing an untracked one
        # builds locally and dies on Vercel (v0.4.194, 2026-07-28).
        "Untracked-import breakage|bash scripts/check-untracked-imports.sh"
        # Arman ruling 2026-07-28 (D64/D65): type errors SCREAM here on every
        # release but never stop the build (ignoreBuildErrors stays true).
        "TypeScript type-check|pnpm type-check"
        "Doctrine check|pnpm exec tsx scripts/check-doctrine.ts"
        "Doc claims vs live config|pnpm exec tsx scripts/check-doc-claims.ts"
        "Route metadata and favicons|pnpm check:route-metadata"
        "Pattern Patrol manifest contracts|pnpm exec tsx scripts/pattern-patrol/check-manifest.ts --repo-only"
        "Turbopack filesystem tracing|pnpm exec tsx scripts/check-turbopack-fs-tracing.ts"
        # Browser dialogs — see the strict lane above for why this class is
        # a dead control, not a style nit. Zero backlog, so the report is
        # the whole finding.
        "Browser dialogs (window.confirm/alert/prompt)|pnpm check:browser-dialogs"
        # Record-naming toasts — see the strict lane above. Baselined, so the
        # report names the whole remaining population every run.
        "Record-naming toasts carry their record|pnpm check:record-toasts"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts"
        "Canonical agent/model pickers|pnpm check:canonical-pickers"
        "Archived-items law (every list has an archive control)|pnpm check:archived-items-law"
        "One agent-list read (package-owned)|pnpm check:agent-list-reads"
        "One \"is this run over?\" predicate (runIsOver)|pnpm check:run-is-over"
        "Scroll-chain (clipped tables/lists)|pnpm exec tsx scripts/check-scroll-chain.ts"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts"
        # Blocking in --strict (see the strict list above); loud and exit-0 here,
        # like every other gate in the advisory list.
        "Unregistered entity-like tables (ratchet)|pnpm exec tsx scripts/canonical-ratchets/check-unregistered-entities.ts"
        "Post-doctrine conformance (ratchet)|pnpm exec tsx scripts/canonical-ratchets/check-post-doctrine-conformance.ts"
        # Blocking in --strict (see above); loud and exit-0 here.
        "NO NULL ORG (ratchet)|pnpm exec tsx scripts/canonical-ratchets/check-org-null.ts"
        # REACHABILITY GUARDS. Two halves, one script. Definition parity
        # (containment_edges deps vs the trigger UPDATE OF list) is a
        # catalog-only, deterministic, one-right-answer check and BLOCKS in
        # strict — a forgotten column silently rots the access cache with no
        # symptom (drift audit 2026-08-15, finding 8 risk 1). Cache drift is
        # a full re-derivation: the script prints it loudly and exits 0
        # without --strict, because the fix is a rebuild + a filed defect,
        # not a blocked release.
        "Reachability standing guards|pnpm check:reachability-guards"
        "DB guards: triggers, planner traps, public exposure|pnpm check:db-guards"
        # HR PUNCH WRITE PATH — BLOCKING in --strict (see the strict list above for
        # why RLS does not prevent a client-direct `insert into hr.punch`). Listed
        # here with `:strict` ON PURPOSE for the same reason component-created-by
        # is below: release.sh runs THIS list (`--advisory || true`), so a bare
        # invocation would exit 0 and print a silent green [OK]. With `:strict`
        # the checker exits 1, run_gate prints a red [FAIL] with the offenders,
        # and advisory mode still exits 0 — scream, never block. The lane that
        # actually FAILS is per-PR CI: ci.yml's `hr-punch` job runs
        # check:hr-punch-write-path:strict on every PR/push (HRB-015, 2026-08-26).
        "HR punch write path (client-direct insert into hr.punch)|pnpm check:hr-punch-write-path:strict"
        # Time-bounded DDL that can expire on the calendar — partition runway,
        # catch-all partitions that started receiving rows, stalled pg_cron
        # jobs. Loud, never blocking (D122).
        "Partition runway (time-bounded DDL)|pnpm check:partition-runway"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts"
        "API contract ratchet|pnpm exec tsx scripts/check-api-contracts.ts"
        "Backend boundary approvals|pnpm exec tsx scripts/check-backend-boundaries.ts"
        "Scraper single transport boundary|pnpm check:scraper-routing"
        "Authentication destinations and gates|pnpm check:auth-destinations"
        "Auth doors blind to a split cookie jar|pnpm check:split-jar-doors:strict"
        "Package logic re-grown outside its package|pnpm check:package-twins:strict"
        "A doc or skill teaches a hand-rolled recipe the package owns|pnpm check:docs-twins"
        "Surface manifest drift|pnpm exec tsx scripts/check-surface-drift.ts"
        # Blast radius of the surface VALUE vocabulary: orphan agent bindings /
        # shortcut mappings / write twins, values a sync would delete out from
        # under a consumer, and children shadowing a parent's value. Advisory —
        # it reads the LIVE DB and must never block a release when creds or the
        # network are missing (it exits 3 and says so).
        "Surface value blast radius|pnpm exec tsx scripts/check-surface-impact.ts"
        # Every `writeTargets` entry a manifest DECLARES must have a handler
        # some mount REGISTERS. The two halves live in different files and
        # nothing links them at build time, so a gap is invisible until APPLY
        # time — after the agent planned a turn around the target and the user
        # approved the write. Static (AST over the three registration seams),
        # no credentials, ~10s. ADVISORY in both lanes: a finding is a page to
        # wire, never a stopped release. `pnpm check:surface-write-handlers:self-test`
        # proves the guard can still fail.
        "Surface write targets without a handler|pnpm check:surface-write-handlers"
        "Admin dashboard catalog|pnpm exec tsx scripts/check-admin-catalog.ts"
        "Entity registry generation drift|pnpm check:entity-types"
        "Agent sync fields vs live RPC (snapshot fallback)|pnpm exec tsx scripts/check-agent-sync-fields.ts --live"
        "Access guard check|pnpm exec tsx scripts/check-access-guards.ts"
        "Visibility vocabulary|pnpm exec tsx scripts/check-visibility-vocab.ts"
        # 🚨 `:strict` ON PURPOSE, IN THE ADVISORY LIST TOO — and this line is the
        # fix for a gate that was decor for five days. The checker gates its EXIT
        # CODE on --strict, so the bare `pnpm check:component-created-by` invoked
        # here exited 0 while printing "VIOLATION"; and "VIOLATION" is not one of
        # the banners run_gate's advisory-marker regex knows, so run_gate printed a
        # silent green [OK]. That is exactly the failure mode the comment on that
        # regex warns about. Meanwhile release.sh runs THIS list (`--advisory
        # || true`) and nothing in the repo runs --strict automatically, so 229
        # offenders accumulated behind a green light (see the 2026-08-26 entry in
        # db-rules §6d-1). With `:strict` the checker exits 1, run_gate prints a red
        # [FAIL] with the full offender list, and advisory mode still exits 0 —
        # scream, never block, which is the contract this list actually has.
        "Component ownership law (no created_by)|pnpm check:component-created-by:strict"
        "Protocol mirror sync (aidream)|pnpm exec tsx scripts/check-protocol-sync.ts"
        # A postgres_changes binding on a table that is NOT in the
        # supabase_realtime publication joins, says SUBSCRIBED, and delivers
        # nothing, silently, forever. Four instances shipped (workbench.notes
        # cost real user data; Meet was silent from launch). Resolves every
        # binding through the TS AST in BOTH repos and diffs against live
        # pg_publication_tables — anything it cannot resolve FAILS as
        # UNRESOLVED. Zero backlog by construction, so it exits 1 in both lanes;
        # no creds or no aidream checkout prints LIVE PULL FAILED (a marker
        # run_gate knows) and exits 2 as UNMEASURED, never a quiet green.
        "Subscribed tables in supabase_realtime|pnpm check:realtime-publication"
        "Kind loading-slug twin (aidream)|pnpm exec tsx scripts/check-loading-slug-twin.ts"
        # CONTENT IR / KINDS — the two halves of the kinds program's frontend
        # gate (KINDS_EVERYWHERE_PLAN.md §6.4). The surface export regenerates
        # the compiled detector table from live content_ir.kind_surface and
        # diffs it against BOTH committed twins (this repo's .generated.ts and
        # aidream's kind_surfaces_generated.py), so it catches registry drift
        # and cross-runtime drift in one run; it needs the live DB and fails
        # loudly rather than falling back, by design. The aidream half is
        # enforced by that repo's `kinds-parity` / `kinds-registry-drift` CI
        # jobs; this is where the frontend half is enforced, because this repo
        # deliberately has no commit-time hook and no CI (CLAUDE.md).
        "Kind-surface detector table vs live registry|pnpm check:shapes:surfaces"
        # DANGLING kind_component KEYS: an ACTIVE source='bundled' web/output row
        # may name a component `resolveBlockDispatch` (block-dispatch.tsx) does
        # not have, and NOTHING catches it at runtime — every kind carrying a
        # `legacyBlockType` facet routes through the compiled bridge regardless,
        # so the block renders while the registry advertises a component that
        # does not exist (proven 2026-08-23 by sabotaging `rating`'s row: the
        # render did not move). BLOCKING in both modes: the live backlog is ZERO
        # and the fix is either registering the key or repairing the row. This is
        # the ONE red code from the shape doctor that gates (`--gate=`); the full
        # `check:shapes:strict` report carries a large tracked backlog and stays
        # out of the gates. source='db' rows and `generic_structured` are exempt.
        "Dangling kind_component keys|pnpm check:shapes:components"
        # GENERATED KIND TYPES are the fourth consumer surface (conversion-
        # campaigns.md Law 2 §4): a stale `.gen.ts` COMPILES FINE AND LIES. The
        # generator reads content_ir.kind_definition.emitted_json_schema live and
        # diffs it against every committed file in
        # features/content-ir/kinds/generated/, so a re-seed or an activation
        # (which bumps `version`) can no longer stale the types in silence. It was
        # run BY HAND until 2026-08-23 — nothing invoked it, which is exactly the
        # discipline-instead-of-guard failure the policy names. BLOCKING in strict:
        # the drift count is 0 over 12 files with no backlog to grandfather, and
        # the fix is one command (`pnpm shape:types <kind>`), never an edit to a
        # .gen.ts. Needs the live registry, like its two neighbours here.
        "Generated kind types vs live registry|pnpm check:kind-types"
        # THE `__kind` MARKER LAW genuinely blocks a MERGE — ci.yml runs
        # `pnpm check:kind-marker-law` on every push and PR, so unlike most gates
        # here a red really does stop something. It exits 1 in both modes. `__kind` is part of
        # the data (KINDS_EVERYWHERE_PLAN §4.2); the 2026-08-23 annihilation left
        # ZERO violations and a small, reason-carrying blessed list, so there is
        # no backlog to grandfather. A new stripper is how stored examples and
        # instances lost their identity in the first place — it never earns an
        # advisory carve-out. `pnpm check:kind-marker-law --list` explains every
        # lawful door.
        "The __kind marker law (no stripping)|pnpm check:kind-marker-law"
        # Menu-section naming law (2026-09-10): a `use*MenuSection` that calls no
        # React hook lies to the hook linter and forces callers into hook
        # position; a `build*MenuSection` that calls one escapes it. Zero
        # violations at introduction (9 builders renamed), so a finding is new.
        "Menu-section naming law (use* = hooks, build* = pure, no bare *MenuSection)|pnpm check:menu-naming"
        # THE LIVE-ITEM LAW (2026-09-11): a menu item that looks clickable and
        # cannot act — no handler, an empty handler, `href: ""`, an empty
        # submenu. The wrapper grade above it only ever checked plumbing props,
        # so "no dead controls" read as certified when it had only been walked
        # by hand. Two real violations found and fixed at introduction, so the
        # tree is at zero and a finding is new.
        "Menu items that cannot act (THE LIVE-ITEM LAW)|pnpm check:menu-live-items"
        # autoRun is a UI control; a mode that paints no interface has nothing
        # for it to control, so `autoRun: false` there deletes the run instead
        # of deferring it. Zero violations at introduction (2026-08-25) and one
        # measured victim before it (image-studio DESCRIBE never ran), so there
        # is no backlog to grandfather — a finding is new, and it is a run the
        # user will never get.
        "autoRun never paired with a headless mode|pnpm check:autorun-headless"
        "Agent submission never requires typed user_input|pnpm check:agent-submit-content"
        "Content IR / kinds test suite|pnpm test:content-ir"
        # THE WHOLE JEST SUITE. `package.json`'s `"test"` script was invoked by
        # NOTHING — not CI, not this file, not a hook. CI runs four hand-picked
        # jest scopes (test:content-ir, test:render-matrix, test:workflow-runtime,
        # and two named HR files), so every suite outside them could rot in
        # silence, and 32 of them had: an accidental unscoped `pnpm test` on
        # 2026-09-08 found 32 red suites / 56 red tests that nothing had run in
        # months (FOUND_DEFECTS, that date). A suite nothing runs is not a test,
        # so the ship path runs all of them. 221s over 1,257 suites on a warm
        # checkout — the same order as `type-check`, which is already here.
        # Zero red at introduction (2026-09-09), so there is no backlog to
        # grandfather and it carries no `--advisory`: a finding here is new.
        "Whole jest suite (every suite, not CI's four scopes)|pnpm test"
        # THE LIVE REGISTRY vs THE COMMITTED SNAPSHOT. Same class, same day:
        # `check:shareable-registry` existed and nothing invoked it either, so
        # the snapshot drifted 31 rows behind the live
        # platform.shareable_resource_registry while registry.parity.test.ts —
        # which only ever compares the TS mirror to that snapshot — stayed
        # green on a stale reference. That blind spot is documented in the test
        # itself; this is the invocation that closes it.
        "Shareable registry: live DB vs committed snapshot|pnpm check:shareable-registry"
        "URL identity twins (TS vs Python)|pnpm exec tsx scripts/check-url-identity.ts"
        # STRICT since 2026-08-15 (also in the strict list above): the Wave-5
        # backlog is cleared, so a failure in a --strict run hard-fails it.
        "Docs guards (titles/root-md/pointers)|pnpm exec tsx scripts/check-docs-guards.ts"
        # EVERY PICKER TAKES NEW INPUT (P13). Advisory in both modes: it carries a
        # standing backlog, and each remaining one needs its vocabulary's canonical
        # creator found FIRST — a second write path is worse than the dead end it
        # replaces, so this must never be rushed by a release.
        # Recipe: .claude/skills/picker-custom-entry/SKILL.md
        "Pickers that take new input (P13)|pnpm check:picker-add"
        # THE DOOR LAW — surfaces that name a record without letting the user
        # open it. Advisory by design (Arman: no check blocks a build); the
        # ranked scoreboard lives at /administration/reporting/dead-ends.
        "No dead ends (Door Law)|pnpm exec tsx scripts/dead-ends/check-dead-ends.ts --limit=15"
        # Cross-repo unfinished-work alarm; loud and advisory in every mode.
        # Scoreboard: /administration/reporting/unwired.
        "Unwired work (finish purpose-built artifacts)|pnpm exec tsx scripts/unwired/check-unwired.ts --limit=15"
        # SHARED SKILLS stays ADVISORY in both modes: cross-repo skills are
        # mirrored into every repo on purpose (a one-repo sandbox cannot follow
        # a symlink into common-docs), and the sibling bundle may not be checked
        # out here. It screams; it never blocks a release.
        "Cross-repo skills in sync with common-docs|pnpm exec tsx scripts/check-shared-skills.ts"
        "Skill descriptions fit the listing budget|pnpm exec tsx scripts/check-skill-descriptions.ts"
        # Every surface still guessing why a read failed — see the strict list
        # above for why this is advisory. Fix = <AccessGate/>.
        "Access errors (surfaces that guess why a read failed)|pnpm exec tsx scripts/access-errors/check-access-errors.ts"
        "Media durability (mismatch class)|pnpm check:media-durability"
        # HARDCODED AGENT DEFINITIONS — an agent's prompt/persona living in this
        # repo instead of the DB (Arman, 2026-08-16: the codebase is the
        # CONNECTION, never the definition). Advisory in both modes; the
        # allowlist is a reason-required ratchet whose count only goes down.
        "URL state written outside the canonical primitive|pnpm check:url-state"
        "Retired-database project id handed to agents|pnpm check:retired-db-ref"
        "HR time: client-side hours arithmetic|pnpm check:hr-time-arithmetic"
        "Hardcoded agent definitions (prompts in code)|pnpm check:hardcoded-prompts"
        # HARDCODED AGENT IDS — the same law spelled as a raw UUID (ROLLOUT.md
        # row X4). Baseline ratchet: exits 1 only on a NEW site; advisory here.
        "Hardcoded agent ids (raw agent UUIDs in code)|pnpm check:hardcoded-agents"
        # HAND-TYPED MANDATE KEYS — the same law spelled as a string literal.
        # @ai-matrx/agents 0.10.0 publishes the key set; a literal is a mirror of
        # it, and a rename or retirement on the server becomes a 404 nobody sees.
        # No baseline: the tree was brought to zero on adoption (2026-09-10, 200
        # literals across 76 files), so any finding is NEW.
        "Hand-typed mandate keys (vocabulary not adopted)|pnpm check:mandate-keys"
        # THE DISCLOSURE LAW (Arman, 2026-08-25) — a surface that RUNS an agent
        # registers its fixed jobs in the top Agents menu. Advisory: backlog is 40
        # surfaces deep and a release must not stall on someone else's page.
        "Surfaces running an agent without naming it|pnpm check:agent-disclosure"
        # DDL GUARD LOG — the reader the sentinel never had. Advisory in BOTH
        # modes: the guard's own WARN lane is advisory, and a release that never
        # touches the database must not be blocked because someone else's ALTER
        # TABLE tripped a WARN. Findings are acknowledged WITH A REASON via
        # platform.ddl_guard_ack(); triage is the docs-steward daily step.
        # (2026-08-15 drift audit §1; adjudicated + built 2026-08-21.)
        "Unacknowledged DDL guard firings|pnpm check:ddl-guard-log"
        # New escape hatches vs the frozen baseline — advisory, loud. See the
        # strict list above for why this gate exists here at all (D136).
        "Type-escape hatch ratchet|pnpm check:hatches"
        # Loud here and blocking in --strict: a new handwritten API mirror
        # suppresses the generated-contract drift errors we need to see.
        "Generated API type shadow ratchet|pnpm check:generated-contracts"
        # A generated file EDITED BY HAND — the hole 4c827d5530 walked through on
        # 2026-09-12 (DD-128). Full story in the strict list above; advisory in
        # both lanes, remedy `pnpm sync-types`.
        "Generated API types are fresh, not hand-edited|pnpm check:api-types-fresh"
        # UNIFIED SETTINGS PLATFORM — five guards for ONE defect class: a
        # settings screen that accepts a value the system does not honour
        # (common-docs/projects/unified-settings-platform/REGISTER.md). Orphans
        # and ladder-ui carry a real tracked backlog (registry rows seeded ahead
        # of their consumers; sub-org rungs the universal UI does not address
        # yet), so they are advisory in both lanes; unregistered + env-toggles
        # also run in CI. Every one exits 2 UNMEASURED when it cannot read the
        # live registry — never a warn that reads as a pass.
        "Settings: registry rows no code reads|pnpm check:settings-orphans"
        "Settings: knob reads with no registry row|pnpm check:settings-unregistered"
        "Settings: NEW knob-shaped constants (ratchet)|pnpm check:settings-hardcoded"
        "Settings: behavioural env toggles (ratchet)|pnpm check:settings-env-toggles"
        "Settings: every rung reachable in the universal UI|pnpm check:settings-ladder-ui"
    )
fi

echo ""
echo -e "${BOLD}  Release quality gates${NC}"
echo -e "  ${DIM}${#GATES[@]} checks — each prints its name before it starts${NC}"
if $STRICT; then
    echo -e "  ${CYAN}Mode: strict (exits 1 on findings — manual triage; no automation reads this)${NC}"
else
    echo -e "  ${CYAN}Mode: advisory (reports findings; never blocks ship/push)${NC}"
fi
echo ""

# Heartbeat so a long gate never looks hung — one line every HEARTBEAT_SECS.
HEARTBEAT_SECS=15

print_gate_details() {
    local output_file="$1"

    echo -e "      ${DIM}Details:${NC}"
    awk '
        NF { last_nonblank = NR }
        { lines[NR] = $0 }
        END {
            first_nonblank = 1
            while (first_nonblank <= last_nonblank && lines[first_nonblank] ~ /^[[:space:]]*$/) {
                first_nonblank++
            }
            for (line = first_nonblank; line <= last_nonblank; line++) {
                print "        " lines[line]
            }
        }
    ' "$output_file"
    echo ""
}

run_gate() {
    local step="$1"
    local total="$2"
    local label="$3"
    local cmd="$4"

    local tmp
    tmp="$(mktemp "${TMPDIR:-/tmp}/release-gate.XXXXXX")"

    echo -e "${CYAN}[INFO]${NC}  [$step/$total] ${label}..."

    bash -c "$cmd" >"$tmp" 2>&1 &
    local pid=$!
    local start=$SECONDS
    local last_beat=0

    while kill -0 "$pid" 2>/dev/null; do
        local elapsed=$(( SECONDS - start ))
        if [[ $elapsed -ge $(( last_beat + HEARTBEAT_SECS )) ]]; then
            echo -e "  ${DIM}… still ${label} (${elapsed}s)${NC}"
            last_beat=$elapsed
        fi
        sleep 1
    done

    local exit_code=0
    wait "$pid" || exit_code=$?

    local elapsed=$(( SECONDS - start ))

    # Always surface the check's own report when it wrote anything — advisory
    # mode exits 0 with a loud red box; hiding that would defeat the point.
    local has_output=false
    [[ -s "$tmp" ]] && has_output=true

    if [[ $exit_code -ne 0 ]]; then
        echo -e "${RED}[FAIL]${NC}  [$step/$total] ${label} (${elapsed}s)"
        $has_output && print_gate_details "$tmp"
        rm -f "$tmp"
        return 1
    fi

    # Heuristic: non-strict checkers still print SCHEMA TRUTH-CHECK / FAIL boxes
    # while exiting 0. Treat that as a loud advisory failure for the summary.
    # 🚨 ADD YOUR CHECKER'S BANNER HERE when you add an advisory gate. A checker
    # that screams in a phrase this list does not know prints a silent green
    # [OK] with real findings inside it — which is the exact opposite of
    # "scream, never block", and is how an advisory gate quietly becomes decor.
    #
    # IT WAS NOT A ONE-OFF. 2026-08-29 every one of the 57 advisory gates was
    # run by hand and its badge compared against its actual output: THIRTEEN
    # were printing a green [OK] over real findings. The two known incidents
    # were the visible corner of a systemic hole:
    #   2026-08-26  check:component-created-by printed "VIOLATION" and exited 0.
    #               229 offenders behind a green [OK] for five days. Fixed by
    #               invoking `:strict` in the advisory list (see below).
    #   2026-08-29  check:migrations printed "Migrations: 88 drifted" and exited
    #               0 — drift NEVER changes that checker's exit code, in either
    #               mode, so `:strict` could not have saved it either.
    # ...and the eleven the audit added, worst first:
    #     832  unwired work            PURPOSE-BUILT WORK APPEARS UNFINISHED
    #     198  backend boundaries      BACKEND BOUNDARY APPROVAL REQUIRED
    #     136  NO NULL ORG ratchet     NO NULL ORG VIOLATED   ← see below
    #      41  access errors           [LOUD] … still guess why a read failed
    #      40  agent disclosure        THE DISCLOSURE LAW
    #      33  URL state               raw history writes
    #      28  surface blast radius    Surface impact: 9 breaking, 19 warning
    #      24  UI primitives           [WARN] … hand-rolled control(s)
    #      16  API contract ratchet    check:api-contracts FAILED
    #      10  access guards           [WARN]-only findings (THE VIEW LAW)
    #       2  retired-db ref, doc-claims, stale allowlist entry
    #
    # 🚨 NO NULL ORG IS THE ONE TO LEARN FROM. Its two SIBLING ratchets print
    # `CANONICAL RATCHET EXCEEDED`, which this regex knows — so they badge
    # correctly. check-org-null.ts happens to phrase its scream differently, so
    # the single ratchet with an explicit owner ruling behind it ("make the
    # release script scream ... NO NULL ORG") was the one printing green, over
    # 136 new NULL-org rows across 8 tables. Sibling gates are not evidence.
    #
    # `\[WARN\]` and `\[LOUD\]` are now matched outright, because they are this
    # house's scream tokens — a dozen checkers already print one — and matching
    # the CONVENTION rather than each phrase is what stops the next checker from
    # falling in. Over-reporting is the safe direction here: a needless [WARN]
    # costs a scroll, a needless [OK] costs 229 violations.
    #
    # The lesson every time: an exit code you did not verify is not a signal.
    # After wiring a gate here, run it once with a KNOWN finding present and
    # confirm this script prints [WARN] or [FAIL] — never take green on faith.
    if $has_output && grep -qE '\[FAIL\]|\[WARN\]|\[LOUD\]|ADMIN ROUTE REGISTRY GAP|ROUTE METADATA GAPS|SCHEMA TRUTH-CHECK|PROTOCOL MIRROR DRIFT|DEAD ENDS FOUND|PICKERS THAT DO NOT TAKE NEW INPUT|TYPE-ESCAPE HATCHES ABOVE BASELINE|UNACKNOWLEDGED DDL GUARD FIRINGS|CANONICAL RATCHET EXCEEDED|MIGRATION LEDGER DRIFT|MIGRATION LEDGER UNVERIFIABLE|MIGRATION SLOT COLLISION|NO NULL ORG VIOLATED|gained a nullable organization_id|IS LYING TO AGENTS|check:api-contracts FAILED|BACKEND BOUNDARY APPROVAL REQUIRED|Surface impact: [0-9]+ breaking|PURPOSE-BUILT WORK APPEARS UNFINISHED|still guess why a read failed|raw history writes|instructional references to the RETIRED|THE DISCLOSURE LAW|stale allowlist entry|LIVE PULL FAILED|COMMITTED SNAPSHOT IS STALE|Release gates failed|error\(s\)' "$tmp" 2>/dev/null; then
        echo -e "${YELLOW}[WARN]${NC}  [$step/$total] ${label} (${elapsed}s) — findings below (advisory)"
        print_gate_details "$tmp"
        rm -f "$tmp"
        return 2
    fi

    echo -e "${GREEN}[OK]${NC}    [$step/$total] ${label} (${elapsed}s)"
    # Pass: keep quiet — don't dump the check's healthy chatter.
    rm -f "$tmp"
    return 0
}

failed=0
warned=0
step=1
total=${#GATES[@]}

for entry in "${GATES[@]}"; do
    IFS='|' read -r label cmd <<< "$entry"
    set +e
    run_gate "$step" "$total" "$label" "$cmd"
    rc=$?
    set -e
    if [[ $rc -eq 1 ]]; then
        failed=1
        # Strict: stop early. Advisory: keep going so every gate screams.
        $STRICT && break
    elif [[ $rc -eq 2 ]]; then
        warned=1
    fi
    step=$(( step + 1 ))
done

echo ""
if [[ $failed -ne 0 ]]; then
    echo -e "${RED}${BOLD}Release gates reported failures.${NC}"
    if $STRICT; then
        echo -e "${RED}${BOLD}Strict mode — exiting 1 so your triage sees it. Fix the issues above.${NC}"
        echo ""
        exit 1
    fi
    echo -e "${YELLOW}${BOLD}Advisory mode — ship/push continues. Fix these ASAP.${NC}"
    echo ""
    exit 0
fi

if [[ $warned -ne 0 ]]; then
    echo -e "${YELLOW}${BOLD}Release gates reported warnings (advisory — ship/push continues).${NC}"
    echo ""
    exit 0
fi

echo -e "${GREEN}${BOLD}All release gates passed.${NC}"
echo ""
exit 0
