---
status: active
updated: 2026-08-21
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

## Decisions — RULED by Arman, 2026-08-21 (in chat, this session)

**Q1 (merge row-attribute read with parent-FK fetch): APPROVED — option (a).**
Merge, and let latent registry drift surface as real errors.
**Q2 (parallel-safe kernel): APPROVED to pursue.** Arman's words: "I definitely
think we need to push to do whatever we can do to speed things up because right
now, it is incredibly slow." The equivalence bar below still applies in full.
**Context for whoever executes:** Arman reports SYSTEM-WIDE sluggishness since
the database + server move (chat side panel, marketing surfaces "almost
unbearable") and wants MEASUREMENTS. Do not assume this handoff's scan is the
cause — measure first; this doc's scope is the kernel, not the whole regression.

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

## ATTACHED CAMPAIGN — the bare `auth.uid()` sweep (added 2026-08-22)

The 2026-08-22 slowness investigation found the repeating shape: a bare
`auth.uid()` in a SQL function's WHERE is re-evaluated PER ROW and blocks the
index, so RLS's `iam.has_access` arm fires across whole tables.
`get_cx_conversation_source_facets` went **2,869 ms → 18 ms** from the one-line
`(select auth.uid())` fix (`migrations/cx_source_facets_initplan_uid.sql`).
A live census counts **~270 functions** matching the bare pattern (upper bound —
plpgsql `v_uid := auth.uid()` assignments are benign). The campaign: classify
(SQL-in-WHERE vs benign), fix in measured batches (EXPLAIN before/after each),
never touch SECURITY DEFINER/INVOKER while converting. Same equivalence bar as
everything in this doc. Also verify new RLS policies keep the InitPlan form —
`iam.apply_rls` already emits it correctly.

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
