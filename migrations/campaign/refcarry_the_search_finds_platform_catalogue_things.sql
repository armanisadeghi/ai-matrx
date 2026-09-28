-- chair-step: it REPLACES custom.entity_reference_search(uuid, text[], text, integer) — adding one more
--   way in for platform catalogue rows (public AI models, system agents) that are neither the person's,
--   in their organizations, nor granted by id. No grant is widened; every candidate still passes
--   custom._entity_reference_target_ok (iam.has_access). Nothing is created or dropped. Locks no table.
--   The inverse puts back the body of refcarry_a_person_can_search_what_a_reference_may_point_at.sql.
-- lane: REFERENCE-CARRY
-- lock: custom,platform
-- based-on: custom.entity_reference_search(uuid, text[], text, integer) 85b6be19c7a65dca0471df7bfcaabce03a2e4c8ee252d4403b6989bb40a3dab8
--
-- THE USE CASE. admin's Workspace keeps a Model Picks table whose "Model" column points at AI models
-- (an entity reference, allowed kind ai_model). The owner-seat walk (2026-09-28 22:05Z) opened its
-- picker, typed "claude" and found nothing: every AI model belongs to the platform's own organization
-- and is readable because it is public, and the first two ways in (what the person made or what lives
-- in their organizations; what is granted to them by id) never list it.

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
  v_sch    text;
  v_tab    text;
  v_title  text;
  v_extra  text;
  v_any    text;
  v_rows   jsonb;
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
    -- THE THIRD WAY IN (lane REFERENCE-CARRY, after the owner-seat walk found no AI model): a
    -- platform catalogue row (an AI model, a system agent) is neither the person's, nor in their
    -- organizations, nor granted to them by id — it is readable because it is public. So the kind's
    -- own table is searched by its title too, and the one gate below (iam.has_access through
    -- custom._entity_reference_target_ok) decides; read ten times deeper than asked. The statement is
    -- built only from the registry (schema, table, title column quoted %I; the words %L).
    select e.schema_name, e.table_name, e.title_column into v_sch, v_tab, v_title
      from platform.entity_types e where e.token = v_token and e.is_active;
    v_extra := '';
    if exists (select 1 from information_schema.columns c where c.table_schema = v_sch and c.table_name = v_tab and c.column_name = 'deleted_at') then
      v_extra := v_extra || ' and t.deleted_at is null';
    end if;
    if exists (select 1 from information_schema.columns c where c.table_schema = v_sch and c.table_name = v_tab and c.column_name = 'canonical_id') then
      v_extra := v_extra || ' and t.canonical_id is null';
    end if;
    if nullif(btrim(p_search), '') is not null then
      v_extra := v_extra || format(' and t.%I::text ilike %L', v_title, '%' || btrim(p_search) || '%');
    end if;
    v_any := format('select t.id, t.%I::text as title from %I.%I t where t.%I is not null%s order by t.%I limit %s',
                    v_title, v_sch, v_tab, v_title, v_extra, v_title, v_limit * 10);
    execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'', s.id, ''title'', s.title)), ''[]''::jsonb) from (%s) s', v_any)
      into v_rows;

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
            union
            select c.id, c.title from jsonb_to_recordset(v_rows) as c(id uuid, title text)
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


