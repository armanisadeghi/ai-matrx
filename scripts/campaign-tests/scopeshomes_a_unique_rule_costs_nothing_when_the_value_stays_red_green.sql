-- LANE SCOPES-STORE-HOMES — A UNIQUE-RULED FIELD COSTS NOTHING ON A WRITE THAT DOES NOT CHANGE IT,
-- measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Bayside Community Library files its catalogue under 4,767 Tags — the size of the biggest
-- Tag Table on production. Every Tag's Slug is unique (the store's `unique` rule). A librarian rewords
-- one Tag's description, or an agent writes a context value onto a Tag: the slug does not change, so the
-- store must not re-read all 4,767 Tags to prove a slug it already proved. A new slug, or a Tag brought
-- back from the archive, is still checked, and a duplicate is still refused in the same plain sentence.
--
-- Everything is synthesized and rolled back. Nothing of anybody's is read or written.
--
-- WHAT MAKES IT FAIL (RED before scopeshomes_a_unique_rule_skips_a_write_that_keeps_the_value.sql):
--   U1  with the Slug Field's unique rule on, rewording 100 Tags' descriptions costs more than 1 ms a
--       write over the same writes with the rule off (today's check scans the whole Table every time)
--   U2  a duplicate slug is still refused, in the same sentence; a restored Tag whose slug is taken is too

\set ON_ERROR_STOP on
\timing off
\set suite 'scopeshomes_a_unique_rule_costs_nothing_when_the_value_stays_red_green.sql'
\set requires 'function:custom._unique_rule_holds|function:custom._ctx_scope_columns'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '900s';

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_n constant int := 4767;
  v_org uuid := gen_random_uuid();
  v_type uuid;
  v_ids uuid[];
  v_t0 timestamptz; v_off numeric; v_on numeric;
  v_refused text;
  v_slugfield uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/scopeshomes-unique', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Bayside Community Library ' || substr(v_org::text, 1, 6), 'bayside-library-' || substr(v_org::text, 1, 8), 'BCL', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopeshomes-u')::text, true);
  perform set_config('role', 'authenticated', true);
  v_type := (custom.context_type_write(v_org, null, '{"label_singular": "Tag", "label_plural": "Tags"}'::jsonb) -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);
  v_slugfield := custom._ctx_id('scope-column-field', v_type::text, 'slug');

  -- 4,767 Tags, written as the store half writes them (the rule off while they land, so the fixture is fast).
  update custom.record set data = data || '{"rules": []}'::jsonb where organization_id = v_org and id = v_slugfield;
  perform custom._ctx_mark('bridge');
  insert into custom.record (id, organization_id, table_id, data_class, data, visibility, metadata)
  select gen_random_uuid(), v_org, v_type, 'record',
         jsonb_build_object('name', 'Subject ' || g, 'description', 'Catalogue heading ' || g,
                            'slug', 'subject-' || g, 'sort_order', 0),
         'internal', '{"moved_from": {"table": "context.scopes", "note": "scopeshomes timing fixture"}}'::jsonb
    from generate_series(1, c_n) g;
  select array_agg(id order by id) into v_ids
    from (select id from custom.record where organization_id = v_org and table_id = v_type and data_class = 'record' limit 100) x;

  -- ══ U1: the same 100 description rewrites, rule off and rule on ══
  v_t0 := clock_timestamp();
  update custom.record set data = data || jsonb_build_object('description', 'Reworded heading (a)')
   where organization_id = v_org and id = any (v_ids);
  v_off := extract(epoch from clock_timestamp() - v_t0) * 1000;
  update custom.record set data = data || '{"rules": [{"kind": "unique"}]}'::jsonb where organization_id = v_org and id = v_slugfield;
  v_t0 := clock_timestamp();
  update custom.record set data = data || jsonb_build_object('description', 'Reworded heading (b)')
   where organization_id = v_org and id = any (v_ids);
  v_on := extract(epoch from clock_timestamp() - v_t0) * 1000;
  raise notice 'U1 measured: 100 rewrites on a % -Tag Table: rule off % ms, rule on % ms (% ms a write for the rule)',
    c_n, round(v_off, 1), round(v_on, 1), round((v_on - v_off) / 100, 2);
  if (v_on - v_off) / 100 > 1.0 then
    raise exception 'U1 RED: the unique rule costs % ms a write that never touched the slug (rule off % ms, on % ms for 100)',
      round((v_on - v_off) / 100, 2), round(v_off, 1), round(v_on, 1);
  end if;

  -- ══ U2: still refused, same sentence ══
  begin
    update custom.record set data = data || '{"slug": "subject-2"}'::jsonb
     where organization_id = v_org and table_id = v_type and data ->> 'slug' = 'subject-1';
    v_refused := null;
  exception when unique_violation then v_refused := sqlerrm;
  end;
  if v_refused is null or v_refused not like 'Another record here already has Slug "subject-2", and Slug has to be different on every record.' then
    raise exception 'U2: a duplicate slug was not refused in the plain sentence: %', v_refused;
  end if;
  update custom.record set deleted_at = now() where organization_id = v_org and table_id = v_type and data ->> 'slug' = 'subject-3';
  insert into custom.record (id, organization_id, table_id, data_class, data, visibility, metadata)
  values (gen_random_uuid(), v_org, v_type, 'record', '{"name": "Subject 3 (new)", "slug": "subject-3", "sort_order": 0}'::jsonb, 'internal',
          '{"moved_from": {"table": "context.scopes"}}'::jsonb);
  begin
    update custom.record set deleted_at = null where organization_id = v_org and table_id = v_type and data ->> 'name' = 'Subject 3';
    v_refused := null;
  exception when unique_violation then v_refused := sqlerrm;
  end;
  if v_refused is null then
    raise exception 'U2: a Tag restored from the archive under a slug another live Tag holds was taken';
  end if;

  raise notice 'GREEN U1–U2: a write that keeps the ruled value costs % ms more with the rule than without (100 writes, % Tags); a duplicate and a restore onto a taken slug are still refused in the plain sentence.',
    round((v_on - v_off) / 100, 2), c_n;
end
$t$;

rollback;
