-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.field_dependants(uuid,uuid) 3323311d25ba83b1e920ed8554ea258c8c69f3b94feb3cf5c826da5d4683b8e2
--
-- W3-MIG, part two — THE BY-ID ARM FOUND NOTHING, AND FOUND IT QUIETLY.
--
-- MEASURED (branch, 2026-09-18, scripts/campaign-tests/w3_mig_c18.sql PART 2):
--   amount_usd is read by a formula BY ID and by another BY NAME, and field_dependants
--   found 1 of them.
--
-- The by-id arm tested
--     (r.data -> 'expr')::text || (r.data -> 'config')::text  like '%<id>%'
-- and a FIELD has no top-level `expr` — its formula lives inside `config`. `NULL || anything`
-- is NULL, `NULL like '%…%'` is NULL, and a WHERE clause treats NULL as false. So the arm
-- written specifically to catch the verifier's `amount_usd` case matched no Field at all,
-- silently: no error, no warning, an empty result that looks exactly like "nothing depends on
-- this". The only thing that caught it was a test that knew the answer was two.
--
-- THE CLASS, not the instance: a guard that decides by concatenating jsonb members which may
-- be absent. Both members are now coalesced to '' before the match, and the two documents are
-- searched independently so one being absent cannot blank the other.
--
-- BASED ON, VERIFIED: the body below is the one this file replaces, with only the by-id arm's
-- predicate changed.

create or replace function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
returns table(kind text, dependant_id uuid, label text, how text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_key   text;
  v_table uuid;
begin
  select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id', '')::uuid
    into v_key, v_table
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id and f.data_class = 'field';
  if v_key is null then
    return;                        -- not a Field of this organization: nothing depends on it
  end if;

  return query
  -- (1) BY ID. A Rule's `expr` names a Field as {"field": "<uuid>"}; a formula or derived
  --     Field's `config` names it the same way. A Field has no top-level `expr` and a Rule
  --     may have no `config`, so each document is coalesced and searched on its own — a
  --     concatenation through a NULL is how this arm came to match nothing at all.
  select case r.data_class when 'rule' then 'rule'
                           when 'merge_field' then 'merge field'
                           else 'field' end,
         r.id,
         coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''),
                  nullif(r.data ->> 'key', ''), r.id::text),
         'names it by id'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.id <> p_field_id
     and r.data_class in ('rule', 'field', 'merge_field')
     and (coalesce((r.data -> 'expr')::text, '')   like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'config')::text, '') like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'rules')::text, '')  like '%' || p_field_id::text || '%'
       or coalesce(r.data ->> 'target_field_id', '') = p_field_id::text)
  union
  -- (2) BY KEY, within the same Table. `depends_on` is a list of Field KEYS, so a formula
  --     that reads `amount_usd` by name is just as dependent as one that reads it by id.
  select 'field', r.id,
         coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', r.id::text),
         'reads it by name in depends_on'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'field'
     and r.id <> p_field_id
     and nullif(r.data ->> 'entity_definition_id', '')::uuid is not distinct from v_table
     and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on', '[]'::jsonb)) d
                  where d = v_key);
end;
$fn$;

comment on function custom.field_dependants(uuid, uuid) is
  'REC-18 / T7: every Rule, formula Field and merge field that depends on one Field — by id inside expr, config, rules or target_field_id, and by key inside depends_on. Each document is searched on its own: concatenating two jsonb members, one of which is absent on every Field, made this arm match nothing and say so silently (measured 2026-09-18). The switch this store hides behind is custom/system_enabled, read by custom.assert_store_door on every verb that calls this.';
