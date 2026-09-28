-- chair-step: it CREATES one function, custom.entity_reference_search(uuid, text[], text, integer),
--   declares its platform.client_callable_door row (signed-in callers) and runs
--   `select custom.reopen_declared_doors()`, which issues the EXECUTE grant to `authenticated` that
--   the row declares (the same route as scr_a_signed_in_person_may_name_platform_entities.sql).
--   Nothing is replaced, dropped or revoked; no table, trigger, policy or row of anybody's data is
--   touched, so it locks no table. `anon` gains nothing. The inverse is
--   `migrations/inverse/refcarry_a_person_can_search_what_a_reference_may_point_at_down.sql`.
-- lane: REFERENCE-CARRY
-- lock: custom,platform
--
-- LANE REFERENCE-CARRY · A REFERENCE COLUMN IS EDITED WITH A PICKER.
--
-- THE USE CASE. Cedar Ridge Veterinary Clinic keeps a Procedures table; each procedure points at
-- the agent that drafts its after-care sheet and at the note holding the clinic's anaesthesia
-- protocol (an entity reference: `config.target_mode = 'any'`, `allowed_types = ['agent','note']`).
-- Until this file the store could name what such a cell held (`custom.entity_reference_words`) but
-- had no door that FINDS platform things for a person, so records-ui offered no way to add one
-- ("A reference is added from the thing itself, by an agent, or by an import") and a person could
-- only take a reference off.
--
-- THE DOOR. custom.entity_reference_search(p_organization_id, p_tokens, p_search, p_limit) answers
-- [{token, id, label}] — the things of those kinds whose title holds p_search (all of them, first by
-- title, when p_search is empty), found through the platform's one reference search
-- (public.reference_search_candidates, which every kind custom.entity_reference_kinds() lists can
-- answer: each is reference_pickable with a title column) — what the person made or what lives in
-- their organizations, plus what is shared with them by id (iam.accessible_entity_candidates) — and
-- KEPT only when the store's own write-time check, custom._entity_reference_target_ok, admits it
-- for this caller: the thing is live and iam.has_access(token, id, viewer) says yes. So everything
-- offered is something the store will accept when the cell is saved, a thing shared from outside
-- the organization can be picked, and nothing a person may not open is ever named.
--
--   p_organization_id  the organization wall first (custom.assert_client_may_reach).
--   p_tokens           only kinds custom.entity_reference_kinds() lists; any other is refused by
--                      name (22023). At most 40 kinds in one call.
--   p_search           trimmed; null / '' lists the first things by title.
--   p_limit            clamped to 1..50 (default 20).


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


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'entity_reference_search', 'p_organization_id uuid, p_tokens text[], p_search text, p_limit integer',
   array['uuid'::regtype, 'text[]'::regtype, 'text'::regtype, 'integer'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach before anything is read. Each kind of p_tokens must be one custom.entity_reference_kinds() lists (22023 otherwise). Candidates come from public.reference_search_candidates (by words, and by id over iam.accessible_entity_candidates) and each is kept only when custom._entity_reference_target_ok — live, and iam.has_access(token, id, viewer) for the caller — admits it, so a thing the caller may not open is never named. It writes nothing.',
   'refcarry_a_person_can_search_what_a_reference_may_point_at.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'refcarry_a_person_can_search_what_a_reference_may_point_at.sql',
     'declared_at', '2026-09-28 lane REFERENCE-CARRY',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-28 lane REFERENCE-CARRY — written with this body'),
       'p_tokens', jsonb_build_object('type', 'text[]', 'position', 2, 'entity', 'entity_type',
         'check', 'every kind must be one custom.entity_reference_kinds() lists; anything else is refused 22023 by name; at most 40.',
         'verified', '2026-09-28 lane REFERENCE-CARRY — written with this body'),
       'p_search', jsonb_build_object('type', 'text', 'position', 3,
         'check', 'a words filter on the kind''s title column only; it widens nothing.',
         'verified', '2026-09-28 lane REFERENCE-CARRY — written with this body'),
       'p_limit', jsonb_build_object('type', 'integer', 'position', 4,
         'check', 'clamped to 1..50.',
         'verified', '2026-09-28 lane REFERENCE-CARRY — written with this body'))))
on conflict do nothing;

select custom.reopen_declared_doors();
