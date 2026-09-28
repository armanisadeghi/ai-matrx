-- chair-step: the inverse of refcarry_the_search_finds_platform_catalogue_things.sql — puts back the
--   search door's body from refcarry_a_person_can_search_what_a_reference_may_point_at.sql.
-- lane: REFERENCE-CARRY
-- lock: custom,platform
-- based-on: custom.entity_reference_search(uuid, text[], text, integer) 069a1a51ee47d5ea727d408fb2e6ea8a925637f57957347c5753c0ad484a5b54

create or replace function custom.entity_reference_search(
  p_organization_id uuid,
  p_tokens text[],
  p_search text default null,
  p_limit integer default 20
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'pg_catalog'
as $function$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_tokens text[];
  v_bad    text;
  v_token  text;
  v_out    jsonb := '[]'::jsonb;
  v_found  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_reference_search');
  select coalesce(array_agg(distinct lower(btrim(t))), '{}') into v_tokens
    from unnest(coalesce(p_tokens, '{}')) as u(t)
   where nullif(btrim(t), '') is not null;
  if cardinality(v_tokens) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(v_tokens) > 40 then
    raise exception 'At most 40 kinds are searched in one call, and this asked for %.', cardinality(v_tokens)
      using errcode = '22023', hint = 'REFERENCE-CARRY: narrow the kinds, or search one kind at a time.';
  end if;
  select t into v_bad
    from unnest(v_tokens) as u(t)
   where not exists (select 1 from custom.entity_reference_kinds() k where k.token = u.t)
   limit 1;
  if v_bad is not null then
    raise exception 'A reference cannot point at "%": it is not a kind of platform thing a record may point at.', v_bad
      using errcode = '22023',
            hint = 'REFERENCE-CARRY: the kinds are custom.entity_reference_kinds(). A file is a File column and a person a Person column.';
  end if;

  foreach v_token in array v_tokens loop
    -- TWO WAYS IN, ONE GATE. The platform's reference search enumerates what the person made or what
    -- lives in an organization they belong to; that is only a candidate list (organization is
    -- tenancy, never permission). Things SHARED with them from anywhere come in by id
    -- (iam.accessible_entity_candidates — grants, memberships, reach), searched by the same words.
    -- Every candidate then passes the store's own write check, which asks iam.has_access. The first
    -- list is read four times deeper than asked so the gate rarely leaves it short.
    select coalesce(jsonb_agg(jsonb_build_object('token', v_token, 'id', c.id, 'label', c.title)), '[]'::jsonb)
      into v_found
      from (
        select r.id, r.title
          from (
            select a.id, a.title
              from public.reference_search_candidates(v_token, nullif(btrim(p_search), ''), v_limit * 4, null) as a(id, title)
            union
            select b.id, b.title
              from public.reference_search_candidates(v_token, nullif(btrim(p_search), ''), v_limit,
                                                      iam.accessible_entity_candidates(v_token)) as b(id, title)
          ) r
         where custom._entity_reference_target_ok(p_organization_id, v_token, r.id)
         order by lower(r.title), r.id
         limit v_limit
      ) c;
    v_out := v_out || v_found;
  end loop;

  -- One list, by title, the first p_limit of every kind asked.
  select coalesce(jsonb_agg(x order by lower(x ->> 'label'), x ->> 'token', x ->> 'id'), '[]'::jsonb)
    into v_out
    from (select x from jsonb_array_elements(v_out) as e(x) order by lower(x ->> 'label') limit v_limit) s;
  return v_out;
end
$function$;


