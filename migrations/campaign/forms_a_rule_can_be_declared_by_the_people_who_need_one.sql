-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE FORMS — NOBODY COULD MAKE A RULE, AND EVERYTHING THAT READS ONE READS A COLUMN
-- ONLY A MIGRATION COULD SET.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20:
--
--   select data_class, count(*) from custom.record group by 1;
--     record 4463 · field 1099 · table 736 · relation 87 · work_instantiation 50 ·
--     doc_template 50 · work_template 50 · kernel 9 · RULE 6 · merge_field 1
--
--   select distinct organization_id from custom.record where data_class = 'rule';
--     → ONE organization, and it is the campaign's own fixture org. All six rows were
--       INSERTed by a migration.
--
-- `custom.record.data_class` DEFAULTS to `'record'`, and the doors that set it to
-- anything else are `custom.table_declare` ('table'), `custom.field_declare` ('field')
-- and the work and document doors. **There was no `custom.rule_declare`.** A client, an
-- agent or a package writing a Rule had exactly one route — `custom.record_write` into
-- the Rule kernel — and every row it produced carried `data_class = 'record'`.
--
-- WHY THAT IS NOT COSMETIC. `custom._rule_shape_guard` still fires on those rows and
-- still validates them, so they LOOK like Rules and they ARE valid Rules. But everything
-- that goes LOOKING for a Rule looks for the class:
--
--   custom.agg_subscriptions  ·  and r.data_class = 'rule'      ← DOOR-18's subscriptions
--
-- measured here by writing a correct subscription Rule through the only available route
-- and watching `custom.agg_subscriptions(org, null, null)` return zero rows while the row
-- sat in `custom.record` with its `subscription` block intact. So REC-15's one Rule
-- object — the thing validation, computation, membership, applicability, the form's
-- accept test and every notification stand on — was reachable by no caller on the
-- platform. `custom.field_declare`'s own comment named this exact class one defect
-- earlier: *"`data_class = 'field'` is the other half of what no client could write."*
--
-- THIS FILE IS THAT OTHER HALF FOR RULES, and it is deliberately the SAME shape as
-- `custom.field_declare`: the store's switch, then the organization wall, then ADMIN on
-- the Table the Rule speaks about — because a Rule decides what that Table will accept,
-- which is a change to its shape and not an edit of a row. Validation is left entirely to
-- `custom._rule_shape_guard` and `custom._rule_topology_guard`, which already refuse a
-- nameless Rule, an unknown use, an expression node the store cannot work out and a Field
-- reference that is a name rather than an id — in the writer's own words. A second
-- validator here would be the first one to disagree with them.
--
-- THE INVERSE: `migrations/inverse/forms_down.sql`.

-- THE TWO ORDERING LAWS COLLIDE HERE, AND THE COLLISION IS WORTH THE FOUR LINES.
-- Lane FORTY-FIVE's law says a `platform.client_callable_door` row must land BEFORE the
-- GRANT, or `platform.enforce_definer_client_grants`' sweep silently takes the grant back.
-- But `platform.door_identity_is_the_catalogs()` refuses a door row whose function does
-- not exist yet — 23514, "the identity_argtypes on this row name no live function" —
-- so the row cannot come first either. The order that satisfies both is: FUNCTION, then
-- ROW, then the GRANT in its own file, which is
-- `forms_a_rule_declaring_door_can_be_reached.sql` beside this one.

set lock_timeout = '5s';
set statement_timeout = '600s';

create function custom.rule_declare(p_organization_id uuid,
                                    p_spec jsonb,
                                    p_rule_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_scope uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.rule_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.rule_declare');

  if jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'A rule has to be written down before it can be saved.'
      using errcode = '22004',
            hint = 'REC-15: the spec is {name, kind: predicate|expression, uses: [...], scope_table_id, applies_to_types: [], expr: {...}}. A subscription Rule (DOOR-18) carries a `subscription` block beside those.';
  end if;

  v_scope := nullif(p_spec ->> 'scope_table_id', '')::uuid;
  if v_scope is null then
    raise exception 'A rule has to say what it is a rule about.'
      using errcode = '22004',
            hint = 'REC-15: scope_table_id names the Table record whose records this Rule speaks about. custom._rule_shape_guard refuses it otherwise, in its own words.';
  end if;

  -- A RULE DECIDES WHAT A TABLE WILL ACCEPT, so writing one is an admin act on that
  -- Table — the same rung custom.field_declare asks for, and for the same reason: this
  -- is the table's shape, not one of its rows.
  perform custom.assert_client_may_change(p_organization_id, v_scope, 'custom.rule_declare',
                                          'admin'::public.permission_level, 'table');

  if p_rule_id is null then
    -- `data_class = 'rule'` is the whole point of this door. Everything else about the
    -- document is judged by custom._rule_shape_guard on the way in.
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.rule_kernel_id(), 'rule', p_spec)
    returning id into v_id;
    return v_id;
  end if;

  -- REC-19: a Rule has versions, and History knows which version produced a Value. The
  -- version moves here for the same reason it moves on any other record.
  update custom.record
     set data = p_spec, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_rule_id
     and table_id = custom.rule_kernel_id()
     and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'There is no rule % in this organization.', p_rule_id
      using errcode = '23503',
            hint = 'A rule id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;
  return v_id;
end;
$fn$;

comment on function custom.rule_declare(uuid, jsonb, uuid) is
  'REC-15: write ONE Rule — the object that validates, computes, decides membership and decides applicability — as a real Rule, with data_class = ''rule''. Before this door the only route was custom.record_write into the Rule kernel, which produced data_class = ''record'', and every reader that looks for a Rule by class (custom.agg_subscriptions, DOOR-18) could not see it. Needs ADMIN on the Table the Rule is about, because a Rule is that Table''s shape. All validation is custom._rule_shape_guard''s and custom._rule_topology_guard''s, unchanged.';


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'rule_declare',
        'p_organization_id uuid, p_spec jsonb, p_rule_id uuid',
        array['uuid'::regtype, 'jsonb'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and then by custom.assert_client_may_reach on entry; NULL is refused there. The Table the Rule speaks about is taken from the SPEC, never from a second argument, and the caller is checked by custom.assert_client_may_change at the ADMIN rung against THIS organization — so a scope_table_id from another tenant reads as absent and is refused. p_rule_id is matched together with the organization and the Rule kernel, so another tenant''s rule is absent. Nothing in the spec is executed: custom._rule_shape_guard validates every field reference by id against that table''s own live Fields, and every expression node against custom.rule_node_kinds(), at write time.',
        'forms_a_rule_can_be_declared_by_the_people_who_need_one.sql',
        null, true, false)
on conflict do nothing;
