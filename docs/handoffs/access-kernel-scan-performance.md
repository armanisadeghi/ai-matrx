---
status: parked
updated: 2026-08-25
repos: [matrx-frontend]
vision: [/Users/armanisadeghi/code/common-docs/systems/platform/db-rules/FEATURE.md]
---

# Access kernel — the last 10% of the unfiltered-scan cost

`iam.has_access` was made ~7x cheaper on 2026-08-15 and no longer times out for
every non-owner. An **unfiltered** `select count(*) from files.pages` still
exceeds the 8 s statement cap for an identity that is admitted few rows. Every
real surface filters by `file_id` and is served in ~100 ms, so **nothing is
user-visible today** — this is headroom work, and it is `blocked` because both
remaining moves need Arman's ruling, not more engineering.

## Vision — Arman's words

From `common-docs/systems/platform/db-rules/FEATURE.md` §6, THE SECURITY PHILOSOPHY:

> "Real security is when **the right people get in without blinking, and the
> wrong people cannot get in no matter what they do.** … a legitimate user (or
> their agent — agents act as their user) blocked from their own data is as
> serious a bug as a stranger let in."

> "Never add a security layer on your own authority — the tiers, the resolver,
> and the grant system already exist; your job is to USE them with the correct
> openness, not to invent tighter ones."

A read that dies at the statement cap **is** a legitimate user blocked from
their own data. That is why this is tracked rather than shrugged off.

## Resources

- **Read first:** `migrations/iam_access_kernel_plpgsql_plan_cache_d146_followup.sql`
  — the full diagnosis, every measurement, and the three rewrites that were
  prototyped and **rejected with numbers**. Then section 2 of
  `migrations/files_pages_and_doc_pages_select_set_wise_d146_followup.sql`.
- **Defect record:** `FOUND_DEFECTS.md` → D146.
- **Kernel:** `iam.has_access` → `iam.has_access_for` → `files.has_access_for`
  (for `p_type='file'`) → `iam.has_access_for_base` (4-arg → 5-arg). Row
  attributes come from `platform.entity_row_access_attrs`.
- **Gate:** `pnpm check:access-matrix` (expect **42/42**), `pnpm check:migrations`.
- **DB access:** no psql on this machine. Use aidream's `.venv` asyncpg against
  `SUPABASE_MATRIX_*` from `aidream/.env`, **overriding the port to 5432**.

## Traps that will cost you a day

1. **Port 6543 is TRANSACTION mode** — `SET LOCAL ROLE` leaks across clients and
   silently corrupts identity-scoped RLS testing. Connect on **5432** (session
   mode). aidream's `.env` says 6543; override it.
2. **Never hoist to a set-wise `readable_file_page_file_ids()` twin.** Built,
   applied, measured, reverted — it made a filtered read 12,606 ms. The twin
   cannot see the query's `file_id` filter, so a one-document request pays for
   all 66 files.
3. **Never re-derive the access model** with `accessible_entity_ids`. That is
   the move that broke component reads on 2026-08-13.
4. **Merging the kernel's OR'd arms into one statement is 4x SLOWER**
   (6,499 → 25,219 ms) — the hashed SubPlans get rebuilt per execution. The
   scalar-call variant of the same idea is only −4%. Both already measured.
5. **A `LANGUAGE sql` function nested inside a `LANGUAGE sql` body re-acquires
   its callee's plan on every call.** This is the reason the kernel is now
   plpgsql. Do not "tidy" any of those twelve functions back to `LANGUAGE sql`.
6. **If you arrived from a background chip mentioning `idx_assoc_target_live`,
   ignore that half of it.** That chip was written before the finding was
   re-checked and could not be withdrawn. Its lifetime counters (880 M tuples /
   191 rows per scan) are cumulative and were dominated by the bad plan this
   work already fixed. A live 180 s delta after the fix: 36 scans / 29 rows per
   scan, with `idx_assoc_source_live` carrying the real load at 1.60 rows per
   scan. **The index is healthy — there is nothing to sweep.** General lesson:
   take a delta over a live window before calling a `pg_stat_user_indexes` ratio
   a defect.
7. **`pnpm check:migrations` verifies a SHA-256 of file bytes.** Editing an
   applied migration's comments drifts its checksum — re-apply (they are
   idempotent) and re-record, don't hand-edit the ledger.

## Current numbers

`select count(*) from files.pages` (6,567 rows), unfiltered, with the role's
real 8 s cap. Stable to within 40 ms over five runs.

| identity | before all D146 work | now |
|---|---|---|
| owner (arman) | 2,013 ms | 1,228 ms |
| grant reader | 8 s TIMEOUT | 6,712 ms ✅ |
| super-admin (admin) | 8 s TIMEOUT | 7,523 ms ✅ |
| super-admin (info) | 8 s TIMEOUT | **8,360 ms** ❌ |
| org admin / org member / stranger | 8 s TIMEOUT | **8,25x–8,58x ms** ❌ |
| anon | 171 ms | 133 ms |
| **filtered one-document read** | 281–377 ms | **99–104 ms** |

What remains is intrinsic to the shape: ~15,600 kernel invocations for 6,567
rows (each page resolves its file, then that file's folder) at ~0.55 ms each.
~2.6 s of that is plpgsql's un-cacheable dynamic SQL —
`platform.entity_row_access_attrs` (~1.35 s) plus the parent-FK `execute
format(...)` in the containment loop (~0.9 s).

## Rulings and outcomes (2026-08-21 ruled · 2026-08-22 executed)

**Q1 (merge): APPROVED, EXECUTED, MEASURED MOOT — reverted.** Built as staged
v2 functions, proven equivalent (34,782 probes × 11 identities + element-wise
files.pages/files, ZERO disagreements), then measured: 8,467 ms live vs
8,621 ms merged on the slow-identity unfiltered scan. The 0.9 s premise was
absorbed by the earlier plan-cache work. Full record:
`migrations/access_kernel_q1_merge_verdict.sql` — read it before ever
rebuilding the merge. Registry drift pre-scan: ZERO drift; loud detection
belongs in a guard, not the hot path. **Trap discovered:** the first v2 draft
was built from THIS repo's migration file and the harness caught 7 narrowings —
the live kernel had grown four lanes (library grants, open library, pack
curators, rulebook curators) the file predates. Always rebuild from
`pg_get_functiondef`, never from a migration file.

**Q2 (parallel-safe): APPROVED to pursue, deliberately NOT executed yet.** The
unfiltered whole-table scan serves no real surface (~100 ms filtered paths),
and the 2026-08-22 slowness investigation found and fixed the ACTUAL felt
regressions elsewhere: 940 RLS policies re-evaluated identity per row
(`migrations/rls_initplan_identity_sweep.sql` — advisor `auth_rls_initplan`
class plus the same bug with our own is_platform_admin/is_super_admin/is_admin
helpers on 657 tables), hot RPCs re-parsing the JWT per row (facets 2,869→18 ms;
DM list 196→88 ms; ~24 plpgsql RPCs wrapped), and unscoped client lists. If the
headroom scan ever becomes user-visible, Q2 is the next lever and its bar below
stands.

## Decisions needed (original framing, kept for the executor)

**1. Merge the row-attribute read with the parent-FK fetch?**

*Situation.* Every access check on a row runs two separate dynamic queries
against the same table row: one to read its visibility/owner/org, and a second,
later, to read the foreign key pointing at its parent (a file's folder). Merging
them into a single query would save roughly 0.9 seconds on the slow scan. The
catch: today, if the registry that names those foreign-key columns is wrong for
some entity type, the bad column is simply never read whenever an earlier check
already granted access — the error stays hidden. Merged, that bad column would
be read every time and would start raising errors on rows that work fine today.

*Decide.* (a) Merge, and accept that latent registry drift starts surfacing as
real errors — arguably a feature, since it is a real misconfiguration. (b) Merge
behind a cheap existence check on the column, keeping today's silence. (c) Leave
it alone; 0.9 s is not worth touching the access path.

**2. Allow the access kernel to run across parallel workers?**

*Situation.* PostgreSQL can split a big table scan across several CPU workers,
which would likely cut this scan 3–4x. It refuses to do that for any query that
calls a function not explicitly marked as safe for parallel execution, and none
of the access functions are marked. One of them (`entity_row_access_attrs`) uses
an error-catching block that is awkward under parallelism and would need
rewriting first.

*Decide.* Whether marking the access kernel parallel-safe is acceptable at all.
This is a security-adjacent property of the function that decides who can read
what, so an agent should not grant it. If yes, it is roughly a day of work plus
a full equivalence re-proof.

## ATTACHED CAMPAIGN — the bare `auth.uid()` sweep — **DONE** (verified 2026-08-25)

The 2026-08-22 slowness investigation found the repeating shape: a bare
`auth.uid()` in a SQL function's WHERE is re-evaluated PER ROW and blocks the
index, so RLS's `iam.has_access` arm fires across whole tables.
`get_cx_conversation_source_facets` went **2,869 ms → 18 ms** from the one-line
`(select auth.uid())` fix (`migrations/cx_source_facets_initplan_uid.sql`).

**The sweep is finished.** Applied migrations, all in the ledger:

| migration | applied |
|---|---|
| `cx_source_facets_initplan_uid.sql` (exemplar) | 2026-08-22 |
| `initplan_uid_sweep_batch1.sql` (STABLE read helpers, incl. per-row RLS helpers) | 2026-08-22 |
| `initplan_uid_sweep_batch2.sql` | 2026-08-22 |
| `initplan_uid_sweep_batch3.sql` | 2026-08-22 |
| `rls_initplan_identity_sweep.sql` | 2026-08-24 |

**Re-census 2026-08-25 (live, `pg_proc`).** 507 functions across all app schemas
mention `auth.uid()`; 246 still contain a lexically bare occurrence. Classified
line-by-line, **every one of those is benign** and none is the bug class:

| shape | functions | why benign |
|---|---|---|
| `v_uid uuid := auth.uid()` (declare/assign) | 144 | evaluated once, into a variable |
| scalar `IF` / `RAISE` / `RETURN` guard | 38 | no query, no rows |
| `set updated_by = auth.uid()` (UPDATE SET / INSERT VALUES) | ~10 | a write value, once per statement, never a predicate |
| `'%created_by = ( SELECT auth.uid()%'` string literal | 1 (`iam.verify_canonical`) | it is the checker *looking for* the InitPlan form |

A targeted predicate search (`auth.uid()` on either side of a comparison inside
where/and/or/on/join) returns exactly 4 hits — `platform.lifecycle_user_notice`,
`public.get_dm_conversations_with_details`, `public.guardian_grant`,
`public.guardian_request_student` — and all 4 are scalar `IF` guards comparing
against a *parameter or variable*, executed once per call. **Zero true positives.**

**Spot measurements** (`set local role authenticated` + `set local
request.jwt.claims`, rolled back, `auth.uid()` asserted inside the probe; heaviest
identity = the account owning 12,690 conversations):

| function | before | now |
|---|---|---|
| `public.get_cx_conversation_source_facets` (12,690-conversation identity, 181 rows out) | 2,869 ms | **33 ms** |
| `public.get_cx_conversation_source_facets` (zero-row identity) | — | 9.6 ms |
| `public.mbr_for_user('agent')` | — | 1.6 ms |

`pnpm check:migrations` → no unapplied migrations (the 51 `DRIFTED` warnings are
pre-existing and repo-wide, non-blocking, unrelated to this campaign).

**Standing guard.** New RLS policies must keep the InitPlan form — `iam.apply_rls`
already emits it correctly. The re-census query above is the regression check;
re-run it rather than trusting a raw `prosrc ~ 'auth.uid()'` count, which is an
upper bound dominated by benign declare-block assignments.

## How to prove any change here

The bar is equivalence, not speed. Reproduce the harness the last change used,
or do not ship:

- 12 identities (4 page owners, a shared-knowledge grant reader, 3 super-admins,
  2 org admins, 2 org members, 2 strangers, ANON), each in a **rolled-back**
  transaction with `set local role` + `set local request.jwt.claims`, asserting
  `current_user` **and** `auth.uid()` **and** `auth.role()` inside every probe.
- **31,464 verdict probes** — 874 rows across all 308 active entity tokens × 3
  permission levels × 12 identities — compared old vs new under a strict
  inequality, in **both** directions (narrowing is as serious as widening).
- **Admitted row sets snapshotted element-wise** before and after (62,436 rows).
- Then `pnpm check:access-matrix` → 42/42.
- The database is live and shared: expect a few rows to appear mid-run from
  other sessions. **State and explain them; never filter them away silently.**
  Check `created_at` against your snapshot times and confirm zero rows were
  *lost* — a widening bug cannot present as "only the newest rows, only to their
  own owner and org."

## Done

- Resolver made ~7x cheaper — see `migrations/iam_access_kernel_plpgsql_plan_cache_d146_followup.sql`.
- Policy-shape half of D146 — see `migrations/files_pages_and_doc_pages_select_set_wise_d146_followup.sql` and `migrations/docproc_extraction_grant_lane_set_wise_d146_followup.sql`.
- Never-analyzed planner statistics across platform/iam/files/web/admin/docproc/rag (69 tables, 452 MB) — caught up, with a repeatable block in the same migration.
