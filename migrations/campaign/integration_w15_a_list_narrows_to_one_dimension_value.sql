-- lock: platform
-- lane: INTEGRATION
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) aa6d3890c8284dc3db3457896895310c16a64ff532c0d8b5c86bdfc99960bc8d
-- based-on: public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) a884af3209e3e16529c0a089e0a407c5dd33dced2764ebabf8622a9c82c29a22
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) f04350f3209ae061097fd13acf93c845eeba7d4fa4ab9bc47b96de5ff1ab4fac
--
-- LANE 3 INTEGRATION, SUBLANE W1.5 — THE DIMENSION FILTER: A LIST NARROWS TO ONE DIMENSION VALUE.
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps a Dimension "Practice Area" (Sports rehab,
-- Pediatrics, Vestibular …) and links agents, chats and workflows to its values. On /agents/all a
-- therapist picks Practice Area → Sports rehab beside the organization filter and sees only the
-- agents linked to Sports rehab — in every lane, with true counts, and the link travels in the URL.
--
-- WHAT THIS ADDS (additive):
--   platform.list_dimension_match(p_filters jsonb, p_entity_type text, p_entity_id uuid) — THE ONE
--   SERVER DOOR for "is this row linked to the chosen Dimension value?". It reads the list's own filter
--   bag (`p_filters.__dimension = {"kind":"select","values":[<value id>]}`, written by the list shell's
--   Dimension control, matrx-frontend lib/entity-list/dimensionFilter.ts). No `__dimension` key → true,
--   so every existing call is unchanged. Today a Dimension value is a scope and the link is an edge
--   `platform.associations (source = the row) → ('scope', value id)`, the same edge every "link to
--   scope" control writes. 🚨 LANE 9 (SCOPES-ON-THE-STORE): when scopes move onto the record store, the
--   ONE switch is this function's FROM/WHERE — no list RPC changes again.
--   Plain SQL, no SET clause, fully qualified: the planner inlines it into each list's WHERE.
--   SECURITY INVOKER: the edges are read under the caller's own row security.
--
-- WHAT THIS REPLACES (three bodies, declared above): each list RPC gains ONE predicate line,
--   `AND platform.list_dimension_match(v_f, '<entity token>', j.id)`, inserted before its existing
--   `AND (NOT v_f ? 'archived'` filter in BOTH its blocks (the `_lanes` block the scope counts read and
--   the page block), so the lanes, the counts and the page agree. The bodies are patched in place from
--   the live definition (the based-on hashes are re-verified against production before this runs); the
--   anchor must occur exactly twice or the file raises and nothing changes. Nothing else in any body
--   changes; no table, column, policy, trigger or grant is touched; nothing is written.
--   Inverse: migrations/inverse/integration_w15_a_list_narrows_to_one_dimension_value_down.sql

create or replace function platform.list_dimension_match(
  p_filters jsonb,
  p_entity_type text,
  p_entity_id uuid
) returns boolean
language sql
stable
as $fn$
  select not coalesce(p_filters ? '__dimension', false)
      or exists (
        select 1
        from platform.associations a
        where a.source_type = p_entity_type
          and a.source_id = p_entity_id
          and a.target_type = 'scope'
          and a.deleted_at is null
          and a.target_id::text in (
            select jsonb_array_elements_text(coalesce(p_filters -> '__dimension' -> 'values', '[]'::jsonb))
          )
      )
$fn$;

comment on function platform.list_dimension_match(jsonb, text, uuid) is
  'The list shell''s Dimension filter: true when p_filters carries no __dimension, else when the row has a live association edge to one of its values (today: target_type scope). Lane 9 switches the source here, once.';

-- No REVOKE needed: the ddl_guard closes EXECUTE for anon at a function's birth.
grant execute on function platform.list_dimension_match(jsonb, text, uuid) to authenticated, service_role;

do $patch$
declare
  r record;
  v_def text;
  v_anchor constant text := E'      AND (NOT v_f ? ''archived''';
  v_hits int;
begin
  for r in
    select * from (values
      ('public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'agent'),
      ('public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'conversation'),
      ('public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'workflow')
    ) v(fn, token)
  loop
    v_def := pg_get_functiondef(r.fn);
    if position('platform.list_dimension_match' in v_def) > 0 then
      continue;
    end if;
    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_hits <> 2 then
      raise exception '%: expected the archived-filter anchor twice, found %; nothing changed', r.fn, v_hits;
    end if;
    execute replace(
      v_def,
      v_anchor,
      format(E'      AND platform.list_dimension_match(v_f, %L, j.id)\n', r.token) || v_anchor
    );
  end loop;
end
$patch$;
