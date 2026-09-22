-- lane: ANON-LANES
-- chair-step: this file REPLACES a live generator function body (`iam.apply_table_grants`) and
-- ALTERs a registry table in the REVOKE-protected `platform` schema. The additive allow-list
-- cannot read a body it patches at run time. The replacement reads the LIVE body and asserts its
-- anchor before it writes, and returns untouched if the rule is already taught.
--
-- DD-249 / R12 — THE SYMMETRIC HALF: THE DECLARATION NOW GOVERNS THE LANE IN BOTH DIRECTIONS.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY A GRANT-ONLY FLAG IS HALF A CONTRACT
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `iam.apply_table_grants` learned on 2026-09-21 to ISSUE the anonymous read grant for a table
-- that DECLARES the opt-in, and said out loud that it never withdraws one. A flag that can only
-- add is not a contract: it tells you nothing about a table that did NOT declare, which is where
-- every hole lives. `platform.categories` had its lane on thirteen hand-written column ACLs for
-- weeks and nothing in the database could see that nobody had decided them.
--
-- From here, an ANONYMOUS READ GRANT ON A REGISTERED TABLE IS THE GENERATOR'S OUTPUT OR IT IS
-- NOT THERE. Three arms, and the difference between them is the whole design:
--
--   1. DECLARED (client_anonymous_public_read) or the CLASS resolves an anonymous lane
--      → granted, exactly as before. Untouched by this file.
--
--   2. UNDECLARED, and NO permissive SELECT-capable policy reaches `anon`
--      → a KEY WITH NO DOOR. The grant cannot return a single row; it is a hole in the
--        catalogue's shape and nothing else. REVOKED on sight, table-level and column-level,
--        with a notice naming what went. Four tables are in this state on the main database
--        today (extend.wbx_capture, ui.ui_surface_agent_pref, ui.ui_surface_config,
--        workbench.heatmap_saves) — each still listed in
--        lib/security/public-exposure.ts#ANON_COLUMN_SURFACE as if it served somebody.
--
--   3. UNDECLARED, and a permissive SELECT-capable policy DOES reach `anon`
--      → a LIVE anonymous lane nobody declared. The generator REFUSES (42501) and names both
--        ways out. 🚨 It does NOT revoke. A regeneration that silently deleted a public page
--        would be exactly the failure DOORS-ONLY-5 refused to risk, and the person running the
--        generator is precisely the person who should decide. This is the same shape as the
--        UNDECLARED column-grant refusal a hundred lines above it (db-rules §6d-2).
--
--        The escape hatch is the same one doors-only uses for a cutover it has not finished:
--        `platform.entity_types.anon_lane_pending_withdrawal_reason`. It can only KEEP what the
--        table already has — it never grants, never opens, and carries the reason and the owning
--        lane in its text so the residual is countable instead of invisible.
--
-- WHAT IT IS SET TO TODAY: exactly one row, `platform.feature_knob`. Its lane is a hand-written
-- `feature_knob_read_anon` gated on a `public_read` boolean on a `private`-class `system` table —
-- not the visibility-gated `pub_read` shape the opt-in emits — and 194 anonymous 200s in 24 h were
-- measured on it (DD-230). Canonicalising or withdrawing it is its own ruling, not this lane's.
--
-- ADDITIVE except the one `create or replace function`, which reads the live body and asserts its
-- anchor. It issues no REVOKE of its own: the revoke lives inside the generator and fires only
-- when a table is regenerated.
-- Inverse: migrations/inverse/anonlanes_the_optin_withdraws_an_undeclared_lane.inverse.sql
-- Proof:   scripts/campaign-tests/doorsonly5_the_anon_lane_is_optin_only.sql (8/8, assertion 8 is
--          the RED twin: it plants an undeclared live anonymous lane inside the transaction and
--          asserts the generator refuses it, then clears it and asserts the generator passes.)

set local lock_timeout = '5s';

-- ── 1. THE PENDING-WITHDRAWAL DECLARATION ─────────────────────────────────────
-- A column on the registry table that already holds the opt-in, rather than a new table: the
-- lane's state belongs in one row per token, and `platform.doors_only_pending_cutover` earned its
-- own table only because it is keyed on schema+table for schemas, not tokens.

alter table platform.entity_types
  add column if not exists anon_lane_pending_withdrawal_reason text;

comment on column platform.entity_types.anon_lane_pending_withdrawal_reason is
  'ANON-LANES / DD-249 R12: this table carries a LIVE anonymous read lane that has not been declared through client_anonymous_public_read and has not been withdrawn yet, and the text says why and which lane owns it. It can only KEEP what the table already has: iam.apply_table_grants reads it to downgrade its refusal to a notice, and it never grants, opens or widens anything. The remedy is always one of the two the refusal names -- declare the lane, or close it -- and then delete this text. NULL is the normal state.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entity_types_anon_pending_is_not_also_declared') then
    alter table platform.entity_types
      add constraint entity_types_anon_pending_is_not_also_declared
      check (
        anon_lane_pending_withdrawal_reason is null
        or (not client_anonymous_public_read
            and length(btrim(anon_lane_pending_withdrawal_reason)) >= 40)
      );
  end if;
end $$;

update platform.entity_types
   set anon_lane_pending_withdrawal_reason =
     'platform.feature_knob serves client feature gating that has to resolve BEFORE sign-in: DD-230 measured 194 anonymous 200s in 24 h, every one of them select=feature,key,value. Its lane is the hand-written policy feature_knob_read_anon gated on a `public_read` boolean, on a `private`-class `system` table -- not the visibility-gated pub_read shape iam._apply_rls_unchecked emits for the opt-in -- so declaring the opt-in here would be the wrong shape and reclassifying the table would be a much larger ruling. Owner: lane ANON-LANES hands this one on undecided rather than guessing. 2026-09-21.'
 where schema_name = 'platform' and table_name = 'feature_knob' and is_active
   and not coalesce(client_anonymous_public_read, false);

-- ── 2. THE WITHDRAWAL ARM ─────────────────────────────────────────────────────
-- 🚨 THE BODY IS READ LIVE AND PATCHED, NEVER REPLACED FROM A FILE (db-rules line 491: a
-- 2026-08-29 migration replaced the RLS generator from a stale file copy and silently reverted a
-- live fix). Reading the live body is also what makes these same bytes applicable to two
-- databases whose generators differ.

do $patch$
declare
  v_src text := pg_get_functiondef('iam.apply_table_grants'::regproc);
  v_anchor constant text := '  -- service_role is the server''s bypass lane and always needs full reach.';
  v_new text;
begin
  if position('anon_lane_pending_withdrawal_reason' in v_src) > 0 then
    raise notice 'iam.apply_table_grants already withdraws an undeclared anonymous lane — nothing to patch.';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'iam.apply_table_grants: expected EXACTLY ONE service_role anchor; the body has moved. Re-read it before patching.'
      using errcode = '22023';
  end if;

  v_new := replace(v_src, v_anchor,
    '  -- 🚨 THE SYMMETRIC HALF OF THE OPT-IN (lane ANON-LANES, DD-249 / R12). The block above'
 || E'\n  -- GRANTS the anonymous read lane to a table that declared it. This one is what makes that'
 || E'\n  -- flag a CONTRACT rather than an additive convenience: on a REGISTERED table whose class'
 || E'\n  -- resolves no anonymous lane and which declared none, an `anon` SELECT grant is access'
 || E'\n  -- nobody decided, and it does not survive a generation.'
 || E'\n  --'
 || E'\n  -- A KEY WITH NO DOOR is revoked on sight: no permissive SELECT-capable policy reaches'
 || E'\n  -- `anon`, so the grant cannot return one row, and leaving it is how the catalogue starts'
 || E'\n  -- lying about who can read what.'
 || E'\n  --'
 || E'\n  -- A LIVE LANE IS NEVER SILENTLY DELETED. If a policy DOES reach `anon`, a signed-out page'
 || E'\n  -- is probably reading this table right now, so the generator REFUSES and names both ways'
 || E'\n  -- out -- the same shape as the UNDECLARED column-grant refusal above (db-rules 6d-2).'
 || E'\n  -- `anon_lane_pending_withdrawal_reason` downgrades that refusal to a notice and can only'
 || E'\n  -- KEEP what the table already has.'
 || E'\n  declare'
 || E'\n    v_w_token text;'
 || E'\n    v_w_optin boolean;'
 || E'\n    v_w_pending text;'
 || E'\n    v_w_live_policy boolean;'
 || E'\n    v_w_col text;'
 || E'\n  begin'
 || E'\n    select et.token, coalesce(et.client_anonymous_public_read, false),'
 || E'\n           et.anon_lane_pending_withdrawal_reason'
 || E'\n      into v_w_token, v_w_optin, v_w_pending'
 || E'\n      from platform.entity_types et'
 || E'\n     where et.schema_name = p_schema and et.table_name = p_table and et.is_active'
 || E'\n     limit 1;'
 || E'\n    -- An UNREGISTERED table has no declaration to make and no class to resolve, so this arm'
 || E'\n    -- says nothing about it. Revoking there would be this function guessing.'
 || E'\n    if v_w_token is not null'
 || E'\n       and not coalesce(v_w_optin, false)'
 || E'\n       and not (iam.class_lanes(v_w_token)).anon_lane'
 || E'\n       and (has_table_privilege(''anon'', v_rel, ''SELECT'')'
 || E'\n            or has_any_column_privilege(''anon'', v_rel, ''SELECT'')) then'
 || E'\n      select exists ('
 || E'\n        select 1 from pg_policy p'
 || E'\n         where p.polrelid = v_rel and p.polpermissive and p.polcmd in (''r'',''*'')'
 || E'\n           and (p.polroles = ''{0}''::oid[]'
 || E'\n                or ''anon'' = any(select pg_get_userbyid(x) from unnest(p.polroles) x)))'
 || E'\n        into v_w_live_policy;'
 || E'\n      if v_w_pending is not null then'
 || E'\n        raise notice'
 || E'\n          ''apply_table_grants: %.% carries an anonymous read grant it never declared, and a PENDING WITHDRAWAL row is keeping it: %. It was NOT revoked and NOT widened. The remedy is one of the two below, then clear entity_types.anon_lane_pending_withdrawal_reason.'','
 || E'\n          p_schema, p_table, v_w_pending;'
 || E'\n      elsif v_w_live_policy then'
 || E'\n        raise exception'
 || E'\n          ''apply_table_grants: %.% has a LIVE anonymous read lane it never declared -- `anon` holds SELECT and a permissive SELECT policy reaches it, so a signed-out page may be reading this table right now. Refusing to regenerate rather than silently deleting a public page. TWO legal fixes. (1) THE ROWS ARE MEANT FOR ANONYMOUS READERS: UPDATE platform.entity_types SET client_anonymous_public_read = true, client_anonymous_public_read_reason = %L, client_anonymous_excluded_columns = ARRAY[...] WHERE schema_name = %L AND table_name = %L; -- the array is the columns `anon` must NOT hold, declared not inferred (db-rules 6d-2). (2) NOBODY READS IT ANONYMOUSLY: drop the policy that reaches `anon` and revoke its grant in a migration with an inverse. If neither can be decided today, record WHY in entity_types.anon_lane_pending_withdrawal_reason and this refusal becomes a notice.'','
 || E'\n          p_schema, p_table, ''<which signed-out surface serves these rows>'', p_schema, p_table'
 || E'\n          using errcode = ''42501'';'
 || E'\n      else'
 || E'\n        execute format(''revoke select on %s from anon'', v_tbl);'
 || E'\n        for v_w_col in select attname from pg_attribute'
 || E'\n                        where attrelid = v_rel and attnum > 0 and not attisdropped loop'
 || E'\n          execute format(''revoke select (%I) on %s from anon'', v_w_col, v_tbl);'
 || E'\n        end loop;'
 || E'\n        raise notice'
 || E'\n          ''apply_table_grants: %.% held an `anon` SELECT grant that NO SELECT-capable policy reaches -- a key with no door, which could never return a row -- and it declared no anonymous lane. WITHDRAWN (table-level and every column). If a signed-out reader was meant to exist here, it was already reading nothing: declare the lane AND give the table a policy that reaches `anon`.'','
 || E'\n          p_schema, p_table;'
 || E'\n      end if;'
 || E'\n    end if;'
 || E'\n  end;'
 || E'\n'
 || v_anchor);

  execute v_new;
  raise notice 'iam.apply_table_grants: the undeclared anonymous lane is now withdrawn (dead) or refused (live).';
end
$patch$;
