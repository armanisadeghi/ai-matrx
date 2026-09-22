-- SHARE-OUT / item 2 — THE RED TWIN of `shareout_provenance_green.sql`.
--
-- It puts the PRE-SHARE-OUT body back — the plain SQL function with no ladder call, no
-- grant and only the `_computed` block — runs the green suite's own clauses against it, and
-- proves each one FAILS. Then it ROLLS BACK, so the live door is untouched.
--
-- 🚨 EVERYTHING RUNS INSIDE ONE TRANSACTION THAT ENDS IN ROLLBACK. The `create or replace`
-- below never reaches the database's committed state; if this file is interrupted the
-- transaction dies and the live body stands. Run it with `psql -f`, never statement by hand.
--
-- THE THREE CLAUSES IT PROVES RED (the same three the green file proves green):
--   1  the door is not callable from a person's seat at all (no EXECUTE for authenticated)
--   2  the footnote returns NO rows for Ironclad's invoice — `_computed` is carried by 0 of
--      the store's 15,156 records
--   4  a non-member's refusal does not come from the organization wall, because the old body
--      never asked

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'shareout_provenance_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- The body exactly as it stood before SHARE-OUT.
create or replace function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, rule_id uuid,
              rule_version integer, computed_at timestamptz)
language sql
stable
set search_path to 'pg_catalog'
as $old$
  select e.key,
         (e.value ->> 'field_id')::uuid,
         e.value -> 'value',
         (e.value ->> 'rule_id')::uuid,
         (e.value ->> 'rule_version')::integer,
         (e.value ->> 'at')::timestamptz
    from custom.record r,
         jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$old$;
-- AND ITS DECLARATION GOES WITH IT. `platform.reopen_declared_doors` re-grants EXECUTE to a
-- DECLARED door inside the same transaction as any revoke sweep — the platform working — so
-- a bare REVOKE here would be undone and the twin would measure the new world.
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'computed_provenance'
   and identity_argtypes = array['uuid'::regtype::oid, 'uuid'::regtype::oid];
revoke execute on function custom.computed_provenance(uuid, uuid) from authenticated;

do $red$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_org     constant uuid := '0a751390-558e-4775-ba0e-3891bdf82d45';   -- Ironclad Mobile Mechanic
  c_inv_tbl constant uuid := 'ffbddf5c-e5d8-417c-b82b-eff823f55fc4';   -- its Invoices table
  v_inv     uuid;
  v_rows    integer;
  v_msg     text;
  v_reds    integer := 0;
begin
  perform set_config('app.actor_system', 'campaign.shareout.provenance.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- CLAUSE 1 RED — no client grant at all.
  if has_function_privilege('authenticated', 'custom.computed_provenance(uuid,uuid)', 'EXECUTE') then
    raise exception 'RED TWIN BROKEN: the old body still carries a client grant';
  end if;
  v_reds := v_reds + 1;
  raise notice 'CLAUSE 1 RED: authenticated may EXECUTE custom.computed_provenance = false';

  perform set_config('role', 'authenticated', true);
  select rr.id into v_inv from custom.read_records(c_org, c_inv_tbl, false, 1, 0) rr;
  perform set_config('role', 'postgres', true);
  if v_inv is null then
    raise exception 'RED TWIN SETUP FAILED: no invoice came back through the read door';
  end if;

  -- CLAUSE 2 RED — the footnote has nothing to say about a record whose Total IS worked out.
  select count(*) into v_rows from custom.computed_provenance(c_org, v_inv);
  if v_rows <> 0 then
    raise exception 'RED TWIN BROKEN: the old body returned % rows', v_rows;
  end if;
  v_reds := v_reds + 1;
  raise notice 'CLAUSE 2 RED: the old body returned 0 footnote rows for an invoice whose Total is worked out';

  -- CLAUSE 4 RED — it never asks the organization wall, so it cannot refuse at it.
  begin
    perform count(*) from custom.computed_provenance(c_org, v_inv);
    v_reds := v_reds + 1;
    raise notice 'CLAUSE 4 RED: the old body answered without ever asking the organization wall';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise exception 'RED TWIN BROKEN: the old body refused at the wall: %', v_msg;
  end;

  if v_reds <> 3 then
    raise exception 'RED TWIN INCOMPLETE: % of 3 clauses shown red', v_reds;
  end if;
  raise notice 'SHARE-OUT / item 2 RED: all three clauses fail on the pre-SHARE-OUT bytes.';
end;
$red$;

rollback;
