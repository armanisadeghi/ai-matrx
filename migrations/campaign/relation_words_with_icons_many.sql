-- custom.relation_words_with_icons_many: the words door's answer PLUS each linked record's icon and
-- its table's icon, in one call (CHAIR-EMBEDDED-FIDELITY item 14). A relation cell in an embedded grid
-- reads like Notion's: the record's own icon, else its table's, else a page glyph — no request per cell.
-- ADDITIVE: custom.relation_words_many is untouched. This door wraps it, so the ladder, the withheld
-- sentence and `archived` are the one resolver's; a record whose words did not resolve (withheld or
-- unread) answers null icons too — an icon is never disclosed where the name is not. The record's own
-- icon is `data ->> 'icon'`; the table's is `custom.table.icon`.
create function custom.relation_words_with_icons_many(p_organization_id uuid, p_field_id uuid, p_record_ids uuid[])
 returns table(record_id uuid, words text, archived boolean, icon text, table_icon text)
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select w.record_id, w.words, w.archived,
         case when w.archived is null then null
              else nullif(btrim((select r.data ->> 'icon' from custom.record r
                                  where r.organization_id = p_organization_id and r.id = w.record_id)), '') end,
         case when w.archived is null then null
              else nullif(btrim((select t.icon from custom.record r
                                  join custom."table" t on t.id = r.table_id
                                 where r.organization_id = p_organization_id and r.id = w.record_id)), '') end
    from custom.relation_words_many(p_organization_id, p_field_id, p_record_ids) w;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'relation_words_with_icons_many', 'p_organization_id uuid, p_field_id uuid, p_record_ids uuid[]',
  array['uuid'::regtype, 'uuid'::regtype, 'uuid[]'::regtype]::oid[],
  'The words door''s answer plus each record''s icon and its table''s icon in one call, for a relation cell. It is a thin wrapper over custom.relation_words_many, so the organization wall, the per-record visibility ladder and the withheld sentence are that door''s; an icon is returned only where the words resolved.',
  'migrations/campaign/relation_words_with_icons_many.sql (lane CHAIR-EMBEDDED-FIDELITY)', true, false,
  jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
    'p_organization_id', jsonb_build_object('type', 'uuid', 'entity', 'organization', 'check', 'handed straight to custom.relation_words_many, which decides it with custom.assert_client_may_reach(arg1) - the organization wall - before anything is read; the icon lookups below read only rows of ids that door answered.', 'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-06 lane CHAIR-EMBEDDED-FIDELITY - read from this body'),
    'p_field_id', jsonb_build_object('type', 'uuid', 'check', 'DERIVED. Handed to custom.relation_words_many, which resolves the display through custom._display_of_field within this organization; this body reads nothing with it.', 'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-06 lane CHAIR-EMBEDDED-FIDELITY - read from this body'),
    'p_record_ids', jsonb_build_object('type', 'uuid', 'check', 'A FILTER, NOT A LEAK. It names the rows custom.relation_words_many is asked about; each row is withheld by that door''s ladder when this reader may not open it, and a withheld row (archived is null) gets no icon either.', 'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-06 lane CHAIR-EMBEDDED-FIDELITY - read from this body')),
    'declared_at', '2026-10-06 lane CHAIR-EMBEDDED-FIDELITY', 'declared_by', 'relation_words_with_icons_many.sql'));

grant execute on function custom.relation_words_with_icons_many(uuid, uuid, uuid[]) to authenticated, service_role;
