-- chair-step: it CREATES one function, custom.entity_back_links(uuid, text, uuid, integer, text),
--   declares its platform.client_callable_door row (signed-in callers) and runs
--   `select custom.reopen_declared_doors()`, which issues the EXECUTE grant to `authenticated` that
--   the row declares (the same route as refcarry_a_person_can_search_what_a_reference_may_point_at.sql).
--   Nothing is replaced, dropped or revoked; no table, trigger, policy or row of anybody's data is
--   touched, so it locks no table. `anon` gains nothing. No index is added: idx_assoc_target_live
--   (target_type, target_id) WHERE deleted_at IS NULL already answers the lookup. The inverse is
--   `migrations/inverse/ap4_a_platform_record_lists_the_custom_rows_that_link_to_it_down.sql`.
-- lane: AP-4
-- lock: custom,platform
--
-- LANE AP-4 · A PLATFORM RECORD SHOWS THE CUSTOM ROWS THAT LINK TO IT (THE BACK-LINK DOOR).
--
-- THE USE CASE (CONTRACTS.md §5). An organization keeps an "Onboarding checklist" custom Table whose
-- Employee field is an entity reference (`config.allowed_types = ['hr_employee']`). Each checklist
-- row's link is an edge in platform.associations (source_type 'record', source_id = the row,
-- target_type 'hr_employee', target_id = the employee, relation_field_id = the Field), written by
-- custom._relation_associations_stmt_insert / custom.record_entity_edges. The employee's own page had
-- no way to ask "which custom rows point at me": the edge existed, no door read it from that end.
--
-- THE DOOR. custom.entity_back_links(p_organization_id, p_token, p_record_id, p_limit, p_cursor)
-- answers
--   { target: {token, id, label},
--     items: [{ record: {token:'record', id, label}, table_id, table_label, field_id, field_key,
--               field_label, organization_id, linked_at }],
--     next_cursor }
--
-- READ AS THE CALLER, AND NOTHING ELSE DECIDES:
--   · the organization wall first (custom.assert_client_may_reach on p_organization_id) — that
--     argument is the call's context, never a filter: back-links come from EVERY organization;
--   · the target is a kind custom.entity_reference_kinds() lists, live, and one the caller may open
--     (custom._entity_reference_target_ok — iam.has_access(token, id, viewer)); a target she may not
--     open and an invented id answer the same sentence (02000), the sentence entity_record_read says;
--   · each linking custom row survives only when iam.has_access_for(caller, 'record', id, viewer) —
--     the platform's ONE access answer, which for a custom record climbs the store's own ladder
--     (custom.confidential_answer, grants, the organization lanes) — says yes, it is live, not
--     quarantined, and the
--     Field carrying the link is in that row's read mask for her (custom.read_mask 'visible') — a
--     link held in a field she may not read is a value she may not read;
--   · the server lane (no principal) reads only as the role that owns the store, exactly as
--     custom.query_can_see answers it.
-- Labels: the target's through platform.relation_label (the same access-checked reader
-- custom.entity_reference_words uses); a custom row's from its Table's title_field through
-- custom._card_words, the reading platform.relation_label gives a 'record'.
-- Paging is keyset on (linked_at desc, edge id desc); the cursor is opaque base64 of
-- "<linked_at>|<edge id>". Never offset.
--
-- Seat suite: scripts/campaign-tests/ap4_back_links_green.sql; red twin
-- scripts/campaign-tests/ap4_back_links_red.sql.

set lock_timeout = '4s';

create or replace function custom.entity_back_links(
  p_organization_id uuid,
  p_token text,
  p_record_id uuid,
  p_limit integer default 50,
  p_cursor text default null
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'pg_catalog'
as $function$
declare
  v_token  text := lower(btrim(coalesce(p_token, '')));
  v_limit  integer := coalesce(p_limit, 50);
  v_me     uuid;
  v_owner  boolean;
  v_kind   text;
  v_c_at   timestamptz;
  v_c_id   uuid;
  v_raw    text;
  v_items  jsonb;
  v_n      integer;
  v_next   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_back_links');

  if v_token = '' or p_record_id is null then
    raise exception 'Name the record whose links you want: its kind and its id.'
      using errcode = '22023',
            hint = 'AP-4: custom.entity_back_links(organization, ''hr_employee'', <employee id>).';
  end if;
  if v_limit < 1 or v_limit > 200 then
    raise exception 'A page of links holds 1 to 200 rows, and this asked for %.', v_limit
      using errcode = '22023', hint = 'AP-4: ask a smaller page and follow next_cursor.';
  end if;

  select k.label into v_kind from custom.entity_reference_kinds() k where k.token = v_token;
  if v_kind is null then
    raise exception 'A custom row cannot link to "%": it is not a kind of platform thing a record may point at.', v_token
      using errcode = '22023',
            hint = 'select token, label from custom.entity_reference_kinds() lists every kind a link may name.';
  end if;

  if nullif(btrim(coalesce(p_cursor, '')), '') is not null then
    begin
      v_raw  := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_c_at := split_part(v_raw, '|', 1)::timestamptz;
      v_c_id := split_part(v_raw, '|', 2)::uuid;
    exception when others then
      raise exception 'That page marker is not one this list gave out.'
        using errcode = '22023', hint = 'AP-4: pass next_cursor exactly as it came back, or null for the first page.';
    end;
    if v_c_at is null or v_c_id is null then
      raise exception 'That page marker is not one this list gave out.'
        using errcode = '22023', hint = 'AP-4: pass next_cursor exactly as it came back, or null for the first page.';
    end if;
  end if;

  v_me    := custom.query_principal();
  v_owner := custom.query_is_store_owner();

  -- THE TARGET, BEFORE ANY EDGE IS READ: a thing she may not open and an invented id say the same.
  if (v_me is null and not v_owner)
     or not custom._entity_reference_target_ok(p_organization_id, v_token, p_record_id) then
    raise exception 'There is no % you can open with that id.', lower(v_kind)
      using errcode = '02000',
            hint = 'DOOR-1: a record somebody has not shared with you is the same answer as a record that is not there.';
  end if;

  with page as (
    select a.id as edge_id, a.created_at as linked_at, a.role as field_key,
           r.id as rec_id, r.organization_id as rec_org, r.data as rec_data,
           t.id as table_id, t.data as table_data,
           f.id as field_id, f.data as field_data
      from platform.associations a
      join custom.record r
        on r.organization_id = a.organization_id and r.id = a.source_id
      join custom.record f
        on f.id = a.relation_field_id
      left join custom.record t
        on t.id = r.table_id
     where a.target_type = v_token
       and a.target_id = p_record_id
       and a.deleted_at is null
       and a.source_type = 'record'
       and a.relation_field_id is not null
       and (v_c_at is null or (a.created_at, a.id) < (v_c_at, v_c_id))
       and r.deleted_at is null
       and r.data_class = 'record'
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and f.deleted_at is null
       and f.table_id = custom.field_kernel_id()
       and (v_owner
            or (v_me is not null
                and iam.has_access_for(v_me, 'record', r.id, 'viewer'::public.permission_level)
                and (custom.read_mask(r.organization_id, r.id, 'read') -> 'visible') ? a.role))
     order by a.created_at desc, a.id desc
     limit v_limit + 1
  ), numbered as (
    select p.*, row_number() over (order by p.linked_at desc, p.edge_id desc) as n from page p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'record', jsonb_build_object(
              'token', 'record', 'id', x.rec_id,
              'label', custom._card_words(x.rec_org,
                         coalesce(x.rec_data ->> (x.table_data ->> 'title_field'),
                                  (select l.cached_title from custom.external_link l
                                    where l.record_id = x.rec_id and l.organization_id = x.rec_org
                                    limit 1)),
                         'record')),
           'table_id',        x.table_id,
           'table_label',     x.table_data ->> 'name',
           'field_id',        x.field_id,
           'field_key',       x.field_key,
           'field_label',     coalesce(nullif(x.field_data ->> 'label', ''), nullif(x.field_data ->> 'name', ''), x.field_key),
           'organization_id', x.rec_org,
           'linked_at',       x.linked_at)
           order by x.linked_at desc, x.edge_id desc) filter (where x.n <= v_limit), '[]'::jsonb),
         count(*),
         max(x.linked_at::text || '|' || x.edge_id::text) filter (where x.n = v_limit)
    into v_items, v_n, v_raw
    from numbered x;

  -- A NEXT PAGE EXISTS ONLY WHEN ONE MORE ROW THAN ASKED WAS FOUND; its marker is the last row shown.
  if v_n > v_limit then
    v_next := replace(encode(convert_to(v_raw, 'UTF8'), 'base64'), E'\n', '');
  end if;

  return jsonb_build_object(
    'target', jsonb_build_object('token', v_token, 'id', p_record_id,
                                 'label', platform.relation_label(p_organization_id, v_token, p_record_id)),
    'items', v_items,
    'next_cursor', v_next);
end
$function$;

comment on function custom.entity_back_links(uuid, text, uuid, integer, text) is
  'AP-4: the custom rows that link to a platform record (an entity-reference Field''s edge in platform.associations), read as the caller across every organization she can read; keyset-paged. See migrations/campaign/ap4_a_platform_record_lists_the_custom_rows_that_link_to_it.sql.';

revoke all on function custom.entity_back_links(uuid, text, uuid, integer, text) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'entity_back_links', 'p_organization_id uuid, p_token text, p_record_id uuid, p_limit integer, p_cursor text',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'integer'::regtype, 'text'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach before anything is read; it is the call''s context, never a filter. p_token must be a kind custom.entity_reference_kinds() lists (22023 otherwise). The target is admitted only by custom._entity_reference_target_ok — live, and iam.has_access(token, id, viewer) for the caller — and a target she may not open answers the same 02000 sentence as an invented id. Each linking custom row is kept only when iam.has_access_for(caller, record, id, viewer) says yes, it is live and not quarantined, and the linking Field is in custom.read_mask for that row. It writes nothing.',
   'ap4_a_platform_record_lists_the_custom_rows_that_link_to_it.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'ap4_a_platform_record_lists_the_custom_rows_that_link_to_it.sql',
     'declared_at', '2026-10-06 lane AP-4',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-06 lane AP-4 — written with this body'),
       'p_token', jsonb_build_object('type', 'text', 'position', 2, 'entity', 'entity_type',
         'check', 'must be one custom.entity_reference_kinds() lists; anything else is refused 22023 by name.',
         'verified', '2026-10-06 lane AP-4 — written with this body'),
       'p_record_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'entity_reference',
         'check', 'admitted only by custom._entity_reference_target_ok (live + iam.has_access(token, id, viewer)); otherwise 02000.',
         'foreign', jsonb_build_object('sqlstate', '02000', 'same_as_invented', true),
         'verified', '2026-10-06 lane AP-4 — written with this body'),
       'p_limit', jsonb_build_object('type', 'integer', 'position', 4,
         'check', '1..200, refused 22023 otherwise.',
         'verified', '2026-10-06 lane AP-4 — written with this body'),
       'p_cursor', jsonb_build_object('type', 'text', 'position', 5,
         'check', 'an opaque keyset marker this door gave out; anything else is refused 22023. It narrows the page, it widens nothing.',
         'verified', '2026-10-06 lane AP-4 — written with this body'))))
on conflict do nothing;

select custom.reopen_declared_doors();
