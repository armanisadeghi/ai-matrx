-- chair-step: it CREATES one door, public.get_scope_trees(uuid[], uuid), and its declared client-door row: the answer of public.get_scope_tree for many organizations in one call, with EXECUTE exactly as public.get_scope_tree has it (authenticated, service_role; never anon or PUBLIC). Additive only: no existing body, table, index, policy, grant or data row is touched, and every organization's answer is the one public.get_scope_tree gives it (scripts/campaign-tests/scopesc_the_scope_trees_answer_what_the_scope_tree_answers.sql: both seats, every organization, knob off and on, text-equal).
-- lane: SCOPES-ON-THE-STORE
-- lock: custom
--
-- Inverse: migrations/inverse/scopesc_the_scope_tree_asks_who_may_see_what_once_for_every_organization_down.sql.
--
-- THE USE CASE. A person opens the context inspector (or starts a chat) and the server builds the
-- catalogue of every organization she is in, with its scope types and scopes. admin@admin.com is in 12
-- organizations that have a scope type; the server asks public.get_scope_tree for all of them in one
-- statement (matrx_records ScopeReader.scopes).
--
-- THE DEFECT, MEASURED (2026-10-02). With the store-read switch off (custom/scope_readers_read_the_store,
-- the production state), public.get_scope_tree answers through context.get_scope_tree_from_the_image,
-- whose `s.id in (select context._readable_scope_ids())` works out EVERY scope the person may read in
-- EVERY organization (iam.accessible_entity_ids('scope'): 3,670 ids for admin) -- once per organization
-- asked. One statement over 12 organizations computed the same set 12 times: 9.4-11.6 s on the clone,
-- 1.13 s mean / 4.7 s max on production (pg_stat_statements, 404 calls), and it was the largest single
-- cost of POST /ai/context/preview.
--
-- THE FIX. This door works the set out ONCE and answers each organization from it. Every answer is the
-- per-organization one, row for row:
--   * the organizations answered are exactly those the batched caller kept (`iam.has_org_access`), in the
--     order they were asked;
--   * switch off: the same rows, the same document per row (to_jsonb of the context.scopes row plus the
--     type's four keys) and the same order as context.get_scope_tree_from_the_image;
--   * switch on: public.get_scope_tree itself, per organization (its store reader is per organization
--     already), so a refusal there aborts the statement exactly as the batched caller's did.
CREATE OR REPLACE FUNCTION public.get_scope_trees(p_org_ids uuid[], p_type_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, answer jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- SCOPES-C (lane 9, 2026-10-02): public.get_scope_tree for many organizations, the readable set worked out once.
begin
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return query
      with readable as materialized (select x.id from context._readable_scope_ids() x(id))
      select o.org,
             coalesce((
               select jsonb_agg(
                 to_jsonb(s) || jsonb_build_object(
                   'type_label', st.label_singular,
                   'type_label_plural', st.label_plural,
                   'type_icon', st.icon,
                   'type_color', st.color
                 ) order by st.sort_order, s.sort_order, s.name
               )
               from context.scopes s
               join context.scope_types st on s.scope_type_id = st.id
               where s.organization_id = o.org
                 and s.deleted_at is null and st.deleted_at is null
                 and s.id in (select r.id from readable r)
                 and (p_type_id is null or s.scope_type_id = p_type_id)
             ), '[]'::jsonb)
        from unnest(p_org_ids) with ordinality as o(org, ord)
       where iam.has_org_access(o.org)
       order by o.ord;
    return;
  end if;
  return query
    select o.org, public.get_scope_tree(o.org, p_type_id)
      from unnest(p_org_ids) with ordinality as o(org, ord)
     where iam.has_org_access(o.org)
     order by o.ord;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, anonymous_callers,
   gate_predicate, argument_rules)
values
  ('public', 'get_scope_trees', 'p_org_ids uuid[], p_type_id uuid',
   'SCOPES-ON-THE-STORE (lane 9, sublane C)',
   'public.get_scope_tree for many organizations in one call, with the person''s readable scopes worked out once instead of once per organization. Each organization is answered only when iam.has_org_access is true for the caller (the filter the batched server reader applied before calling public.get_scope_tree), and its answer is public.get_scope_tree''s own: switch off, the same rows and order as context.get_scope_tree_from_the_image; switch on, public.get_scope_tree itself. It names no scope public.get_scope_tree would not name to the same person.',
   true, false,
   'iam.has_org_access',
   jsonb_build_object(
     'version', 1,
     'declared_by', 'scopesc_the_scope_tree_asks_who_may_see_what_once_for_every_organization.sql',
     'arguments', jsonb_build_object(
       'p_org_ids', jsonb_build_object(
         'type', 'uuid[]', 'position', 1, 'optional', false, 'null_rule', '{}'::jsonb,
         'check', 'each p_org_ids element -> iam.has_org_access(...), before any read of that organization',
         'foreign', jsonb_build_object(
           'note', 'an organization the caller may not open is dropped by iam.has_org_access before its scopes are read; a foreign id and an invented one both answer no row',
           'decided_before_read', true),
         'verified', 'static reading 2026-10-02'),
       'p_type_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', true, 'null_rule', '{}'::jsonb, 'sql_default', 'NULL::uuid',
         'check', 'filter over the gated organizations'' own scopes',
         'foreign', jsonb_build_object('note', 'filter over the gated organizations'' own scopes', 'not_a_leak', true),
         'verified', 'static reading 2026-10-02'))))
on conflict do nothing;

-- PUBLIC's default EXECUTE is cleared at a definer's birth (ddl_guard, §6d-4); the declared door above lets this grant stand.
GRANT EXECUTE ON FUNCTION public.get_scope_trees(uuid[], uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_scope_trees(uuid[], uuid) IS
  'public.get_scope_tree for many organizations in one call: one row per organization the caller may open (iam.has_org_access), in the order asked; the person''s readable scopes are worked out once, not once per organization. Lane 9 SCOPES-C, 2026-10-02.';
