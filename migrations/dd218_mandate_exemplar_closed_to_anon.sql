-- dd218_mandate_exemplar_closed_to_anon — THE ONE UNDECLARED ANON SURFACE, CLOSED
-- (DD-218. SECURITY P1. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy.)
--
-- ═══ WHAT IS LIVE, MEASURED 2026-09-14 ═════════════════════════════════════════════════════════
-- `pnpm check:anon-column-surface` — 193 relations live, 192 declared:
--
--   FAIL agent.mandate_exemplar is readable by anon and NOTHING DECLARES IT.
--        22 columns: ... user_input, variables ...
--
-- `agent.mandate_exemplar` is a VIEW (`security_invoker=on`) over `agent.exemplar`, created
-- 2026-08-25 as a "TEMPORARY live-traffic alias ... Drop once the FE release and aidream deploy
-- reference agent.exemplar" (its own COMMENT). anon holds column-level SELECT on 22 of its 27
-- columns — `user_input` and `variables` among them, the two columns THE USER-INPUT LAW reserves
-- for what a human actually typed.
--
-- What a signed-out visitor reads through it TODAY is zero rows, and only by an accident of data:
-- the base table's anon policy is `pub_read` = `deleted_at is null and visibility = 'public'`, and
-- of 876 exemplars **not one** is `public` (measured, this database, 2026-09-14). The day someone
-- marks one public — which is what that flag is FOR — every anonymous visitor on the internet gets
-- its `user_input` and `variables` through this alias, and through the base table beside it.
--
-- ═══ WHY THE GATE WENT RED, WHICH IS NOT WHAT THE BRIEF EXPECTED ═══════════════════════════════
-- The suspicion was "an explicit `grant select ... to anon` issued after DD-186, which is not a
-- default privilege, so DD-196's birth arm could not see it". That is NOT what happened, and the
-- record says so plainly:
--
--   * the grant is DD-186's OWN — `migrations/dd186_anon_columns_views.sql`, applied
--     2026-09-13 09:00:45Z, line 50, granting exactly these 22 columns on this view;
--   * B-78 DECLARED it in the same hour, in `lib/security/public-exposure.ts`
--     (`235696699e`, "the anon column guard covers the whole signed-out surface (DD-186)");
--   * and `cced6b5893` — "fix(security): sync live share and exposure registries", 2026-09-13
--     11:16 — DELETED that declaration block (13 lines) while the live grant stayed exactly
--     where it was.
--
-- So the class is not a grant that arrived unseen. It is a DECLARATION that left: a sweep that
-- claims to sync a registry "to live" removed the one entry live still needed, and the surface
-- became undeclared without a single byte of SQL running. `check:anon-column-surface` caught it —
-- it is the guard that turned this red — but NOTHING RUNS THAT GUARD: it exists only as a pnpm
-- script, it is in no release gate, no CI job and no hook (`grep -rn check:anon-column-surface`
-- outside its own file finds package.json and migration comments and nothing else). The same is
-- true of `check:anon-write-surface`. That is the hole this lane closes beside the grant: both
-- gates join `scripts/run-release-gates.sh`, so the next deleted declaration — or the next grant —
-- fails a release instead of waiting for a lane to happen to run the script.
--
-- ═══ THE SHAPE THIS FILE CHOOSES, AND WHY IT IS ZERO ═══════════════════════════════════════════
-- A four-repository census for a signed-out reader of this view (matrx-frontend, aidream,
-- matrx-extend, matrx-local; `grep -rln mandate_exemplar` then every hit read):
--
--   * matrx-frontend — `features/mandates/admin/**` and `features/surfaces/manifests/mandates.ts`
--     use `mandate_exemplar_draft` / `selected_mandate_exemplars`, which are SURFACE TARGET NAMES,
--     not relations. The admin console reads `agent.exemplar` as `authenticated`.
--   * aidream — reads through matrx-orm as the service role; the only literal
--     `agent.mandate_exemplar` strings in the repo are test doubles (`_Table("agent.mandate_exemplar")`).
--   * matrx-extend, matrx-local — no reader of either name.
--
-- Zero signed-out readers, and the relation is a temporary alias with a drop already written into
-- its own comment. The correct bound for that is not a shorter column list. It is nothing at all.
--
-- ═══ WHAT THIS FILE DOES NOT DO ════════════════════════════════════════════════════════════════
-- It does not touch `agent.exemplar`, the base table. That relation's anon column bound is DECLARED
-- (B-78, `lib/security/public-exposure.ts`, "no signed-out reader was found ... the bound is what
-- keeps a column added tomorrow from publishing itself") and it is still declared after this file.
-- Left named for the chair: the same census that finds no reader for the VIEW finds none for the
-- TABLE either, so `agent.exemplar`'s own 22-column anon grant — `user_input` and `variables`
-- included — is a declared bound around a door nobody uses. Revoking it is a row-surface decision
-- with its own register row, not something a P1 gate-repair may take on its way past.
--
-- It does not drop the view. That is the mandates lane's cutover, on its own schedule.

-- agent.mandate_exemplar — CLOSED to anon. No signed-out reader in any of the four repositories;
-- a temporary rename alias is never a public door.
revoke select on agent.mandate_exemplar from anon;

do $$
declare
  v_cols int;
  v_base_cols int;
begin
  select count(*) into v_cols
    from pg_attribute a
   where a.attrelid = 'agent.mandate_exemplar'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT');
  if v_cols <> 0 then
    raise exception 'dd218: anon still holds SELECT on % column(s) of agent.mandate_exemplar. The '
                    'whole point of this file is that the number is zero.', v_cols;
  end if;

  if has_table_privilege('anon', 'agent.mandate_exemplar'::regclass, 'SELECT') then
    raise exception 'dd218: anon still holds a table-level SELECT on agent.mandate_exemplar.';
  end if;

  -- authenticated is untouched: the admin console reads through this alias until the cutover.
  if not has_table_privilege('authenticated', 'agent.mandate_exemplar'::regclass, 'SELECT') then
    raise exception 'dd218: authenticated LOST its SELECT on agent.mandate_exemplar. This file may '
                    'only close the signed-out door; a signed-in reader losing its read is a defect.';
  end if;

  -- the base table's declared bound is NOT this file's business, and must still be exactly what
  -- lib/security/public-exposure.ts declares (22 of 27 columns).
  select count(*) into v_base_cols
    from pg_attribute a
   where a.attrelid = 'agent.exemplar'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT');
  if v_base_cols <> 22 then
    raise exception 'dd218: agent.exemplar anon column bound moved from 22 to %. This file must not '
                    'touch the base table.', v_base_cols;
  end if;
end $$;

comment on view agent.mandate_exemplar is
  'TEMPORARY live-traffic alias for agent.exemplar (renamed 2026-08-25). Drop once the FE release '
  'and aidream deploy reference agent.exemplar. CLOSED TO anon (DD-218, 2026-09-14): a four-repo '
  'census found no signed-out reader, and a rename alias is never a public door — do not re-grant.';
