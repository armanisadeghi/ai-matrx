-- chair-step: lane SCOPES-READS-REST (L8, SCOPES-CUTOVER-PLAN 2.2 + 4.3.3). Five NEW views beside the five public suggestion views that join context.* (public.v_scope_suggestions, v_scope_suggestions_new, v_context_item_suggestions, v_kg_alerts, v_kg_value_matches): public.<name>_from_store, same columns in the same order and types, security_invoker like the originals, their scope / scope type / context item columns read from the record store through three NEW SECURITY DEFINER lookups (declared client doors, then granted) that answer only what the older tables' row security showed the reader. The originals are untouched; SCOPES-CONTRACT swaps the bodies in its window (scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql). No DDL on any existing object.
-- lane: SCOPES-READS-REST
-- INVERSE: migrations/inverse/scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store_down.sql
-- window-class: new functions + new views + three door rows; no lock on any existing relation beyond ACCESS SHARE on the rag tables the views name. Applied directly (owner, 2026-09-24).

-- ── WHAT THE FIVE SUGGESTION VIEWS JOIN, FROM THE RECORD STORE (lane SCOPES-READS-REST) ───────────
-- public.v_scope_suggestions, v_scope_suggestions_new, v_context_item_suggestions, v_kg_alerts and
-- v_kg_value_matches are security_invoker views read by signed-in people; each LEFT JOINs a scope, a
-- scope type or a context item for its label. `authenticated` holds no privilege on custom.record, so
-- the store-reading twins ask these three SECURITY DEFINER lookups, which answer exactly what the older
-- tables' row security let the reader see (and nothing — the LEFT JOIN's nulls — otherwise):
--   a scope type / scope: organization not archived (org_open_gate, restrictive) unless platform admin;
--     a scope type to a member of its organization; a scope to its creator, to a member of its
--     organization, to anyone in a globally readable system organization, or through a grant
--     (iam.has_access) — the arms of context.scopes std_select that do not read the row column
--     access ladder T-13 retires (every scope of the store's context Tables is shared with its
--     organization, 9,315 of 9,315 measured 2026-09-29, so the arms that read it add nothing);
--   a context item: to a member of its scope type's organization (context_items_select);
--   a platform admin, and a connection with no signed-in person (the server; service_role bypasses
--   row security), see every one.
-- A scope type's slug is printed as the older tables spelled it (hyphens; the store's grammar uses
-- underscores and no older slug held one — measured 2026-09-29).
create or replace function public._ctx_scope_type_facts(p_type_id uuid)
 returns table(label_singular text, label_plural text, icon text, slug text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := (select auth.uid());
  k record;
begin
  if p_type_id is null then return; end if;
  select t.organization_id, t.data into k
    from custom.record t
   where t.id = p_type_id and t.data_class = 'table' and t.data ->> 'kept_for' = 'context'
   limit 1;
  if not found then return; end if;
  if v_uid is not null and not coalesce(public.is_platform_admin(), false) then
    if k.organization_id in (select iam.archived_org_ids()) then return; end if;
    if k.organization_id not in (select iam.my_orgs()) then return; end if;
  end if;
  label_singular := k.data ->> 'label_singular';
  label_plural := k.data ->> 'label_plural';
  icon := k.data ->> 'icon';
  slug := replace(k.data ->> 'slug', '_', '-');
  return next;
end;
$function$;

create or replace function public._ctx_scope_facts(p_scope_id uuid)
 returns table(scope_name text, scope_slug text, scope_type_id uuid,
               type_label_singular text, type_label_plural text, type_icon text, type_slug text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := (select auth.uid());
  s record;
  t record;
begin
  if p_scope_id is null then return; end if;
  select r.organization_id, r.table_id, r.created_by, r.data into s
    from custom.record r
    join custom.record k
      on k.organization_id = r.organization_id and k.id = r.table_id
     and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
   where r.id = p_scope_id and r.data_class = 'record'
   limit 1;
  if not found then return; end if;
  if v_uid is not null and not coalesce(public.is_platform_admin(), false) then
    if s.organization_id in (select iam.archived_org_ids()) then return; end if;
    if not (s.created_by = v_uid
            or s.organization_id in (select iam.my_orgs())
            or s.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)
            or coalesce(iam.has_access('scope', p_scope_id, 'viewer'::public.permission_level), false)) then
      return;
    end if;
  end if;
  scope_name := s.data ->> 'name';
  scope_slug := s.data ->> 'slug';
  select f.label_singular, f.label_plural, f.icon, f.slug into t
    from public._ctx_scope_type_facts(s.table_id) f;
  if found then
    scope_type_id := s.table_id;
    type_label_singular := t.label_singular; type_label_plural := t.label_plural;
    type_icon := t.icon; type_slug := t.slug;
  end if;
  return next;
end;
$function$;

create or replace function public._ctx_item_facts(p_item_id uuid)
 returns table(display_name text, key text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := (select auth.uid());
  f record;
begin
  if p_item_id is null then return; end if;
  select x.organization_id, x.data into f
    from custom.record x
    join custom.record k
      on k.organization_id = x.organization_id and k.data_class = 'table'
     and k.data ->> 'kept_for' = 'context' and k.id::text = x.data ->> 'entity_definition_id'
   where x.id = p_item_id and x.data_class = 'field'
   limit 1;
  if not found then return; end if;
  if v_uid is not null and not coalesce(public.is_platform_admin(), false)
     and f.organization_id not in (select iam.my_orgs()) then
    return;
  end if;
  display_name := f.data ->> 'label';
  key := f.data ->> 'key';
  return next;
end;
$function$;

revoke all on function public._ctx_scope_type_facts(uuid) from public, anon;
revoke all on function public._ctx_scope_facts(uuid) from public, anon;
revoke all on function public._ctx_item_facts(uuid) from public, anon;
grant execute on function public._ctx_scope_type_facts(uuid) to service_role;
grant execute on function public._ctx_scope_facts(uuid) to service_role;
grant execute on function public._ctx_item_facts(uuid) to service_role;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, anonymous_callers, signed_in_callers)
values
  ('public', '_ctx_scope_type_facts', 'p_type_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store.sql (lane SCOPES-READS-REST)',
   'SCOPES-READS-REST: a scope type''s labels, icon and slug from its context Table, for the security_invoker suggestion views a signed-in person reads. Answered only to a member of the Table''s organization (iam.my_orgs), a platform admin or the server; nothing otherwise, so a foreign id and an invented one answer the same.',
   false, true),
  ('public', '_ctx_scope_facts', 'p_scope_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store.sql (lane SCOPES-READS-REST)',
   'SCOPES-READS-REST: a scope''s name and slug and its type''s labels from the record store, for the security_invoker suggestion views. Answered only when the older context.scopes row security would have shown the scope (its creator, a member of its organization, a globally readable system organization, or iam.has_access), a platform admin or the server; nothing otherwise.',
   false, true),
  ('public', '_ctx_item_facts', 'p_item_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store.sql (lane SCOPES-READS-REST)',
   'SCOPES-READS-REST: a context item''s label and key from its Field, for the security_invoker suggestion views. Answered only to a member of its scope type''s organization (iam.my_orgs), a platform admin or the server; nothing otherwise.',
   false, true)
on conflict (schema_name, function_name, identity_argtypes) do update
  set signed_in_callers = excluded.signed_in_callers, anonymous_callers = excluded.anonymous_callers,
      non_client_lane = null, reason = excluded.reason, declared_by = excluded.declared_by;
grant execute on function public._ctx_scope_type_facts(uuid) to authenticated;
grant execute on function public._ctx_scope_facts(uuid) to authenticated;
grant execute on function public._ctx_item_facts(uuid) to authenticated;
comment on function public._ctx_scope_type_facts(uuid) is 'SCOPES-READS-REST (2026-09-29): a scope type''s labels, icon and slug from its context Table in the record store, only when the older context.scope_types row security would have shown it to the reader. For the suggestion views.';
comment on function public._ctx_scope_facts(uuid) is 'SCOPES-READS-REST (2026-09-29): a scope''s name and slug and its type''s labels from the record store, only when the older context.scopes / scope_types row security would have shown them to the reader. For the suggestion views.';
comment on function public._ctx_item_facts(uuid) is 'SCOPES-READS-REST (2026-09-29): a context item''s label and key from its Field in the record store, only when the older context.context_items row security would have shown it. For the suggestion views.';

create or replace view public.v_context_item_suggestions_from_store with (security_invoker = true) as
SELECT s.id,
    s.user_id,
    s.organization_id,
    s.scope_type_id,
    s.suggested_key,
    s.display_name,
    s.rationale,
    s.example_value,
    s.example_source_kind,
    s.example_source_id,
    s.confidence,
    s.status,
    s.created_at,
    s.decided_at,
    s.decided_by,
    s.suppressed_until,
    st.label_singular AS scope_type_label,
    st.label_plural AS scope_type_label_plural,
    st.icon AS scope_type_icon,
    st.slug AS scope_type_slug
   FROM rag.context_item_suggestions s
     LEFT JOIN LATERAL public._ctx_scope_type_facts(s.scope_type_id) st(label_singular, label_plural, icon, slug) ON true;
grant select on public.v_context_item_suggestions_from_store to authenticated, service_role;
comment on view public.v_context_item_suggestions_from_store is 'SCOPES-READS-REST (2026-09-29): public.v_context_item_suggestions with its scope / scope type / context item columns read from the record store (same columns, same row security). Built beside the older view; SCOPES-CONTRACT swaps it in at the window (scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql).';

create or replace view public.v_kg_alerts_from_store with (security_invoker = true) as
SELECT a.id,
    a.user_id,
    a.organization_id,
    a.source_kind,
    a.source_id,
    a.target_scope_id,
    a.target_slot_key,
    a.kind,
    a.severity,
    a.description,
    a.suggested_action,
    a.evidence,
    a.confidence,
    a.status,
    a.created_at,
    a.decided_at,
    a.decided_by,
    a.viewed_at,
    s.scope_name
   FROM rag.kg_alerts a
     LEFT JOIN LATERAL public._ctx_scope_facts(a.target_scope_id) s ON true
  WHERE a.deleted_at IS NULL;
grant select on public.v_kg_alerts_from_store to authenticated, service_role;
comment on view public.v_kg_alerts_from_store is 'SCOPES-READS-REST (2026-09-29): public.v_kg_alerts with its scope / scope type / context item columns read from the record store (same columns, same row security). Built beside the older view; SCOPES-CONTRACT swaps it in at the window (scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql).';

create or replace view public.v_kg_value_matches_from_store with (security_invoker = true) as
SELECT m.id,
    m.user_id,
    m.organization_id,
    m.source_kind,
    m.source_id,
    m.kg_entity_id,
    m.target_scope_id,
    m.target_context_item_id,
    m.target_slot_key,
    m.matched_value,
    m.current_value_snapshot,
    m.mention_count,
    m.evidence_chunk_id,
    m.confidence,
    m.created_at,
    sc.scope_name,
    sc.scope_slug,
    sc.type_label_singular AS scope_type_label,
    sc.type_icon AS scope_type_icon,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.kg_value_matches m
     LEFT JOIN LATERAL public._ctx_scope_facts(m.target_scope_id) sc ON true
     LEFT JOIN LATERAL public._ctx_item_facts(m.target_context_item_id) ci ON true
  WHERE m.deleted_at IS NULL;
grant select on public.v_kg_value_matches_from_store to authenticated, service_role;
comment on view public.v_kg_value_matches_from_store is 'SCOPES-READS-REST (2026-09-29): public.v_kg_value_matches with its scope / scope type / context item columns read from the record store (same columns, same row security). Built beside the older view; SCOPES-CONTRACT swaps it in at the window (scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql).';

create or replace view public.v_scope_suggestions_from_store with (security_invoker = true) as
SELECT s.id,
    'value'::text AS stage,
    s.created_by AS user_id,
    s.organization_id,
    s.source_kind,
    s.source_id,
    s.kg_entity_id,
    s.target_scope_id,
    s.target_context_item_id AS target_item_id,
    s.target_slot_key AS target_slot,
    s.suggested_value,
    s.current_value_snapshot,
    s.match_kind,
    s.confidence,
    s.status,
    s.context_snippet,
    s.decision_note,
    s.is_starred,
    s.viewed_at,
    s.created_at,
    s.decided_at,
    s.decided_by,
    s.suppressed_until,
    org.name AS org_name,
    org.slug AS org_slug,
    sc.scope_type_id,
    sc.type_label_singular AS scope_type_label,
    sc.type_slug AS scope_type_slug,
    sc.type_icon AS scope_type_icon,
    sc.scope_name,
    sc.scope_slug,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.scope_item_value_suggestions s
     LEFT JOIN LATERAL public._ctx_scope_facts(s.target_scope_id) sc ON true
     LEFT JOIN iam.organizations org ON org.id = s.organization_id
     LEFT JOIN LATERAL public._ctx_item_facts(s.target_context_item_id) ci ON true
  WHERE s.deleted_at IS NULL
UNION ALL
 SELECT a.id,
    'association'::text AS stage,
    a.created_by AS user_id,
    a.organization_id,
    a.source_kind,
    a.source_id,
    a.kg_entity_id,
    a.target_scope_id,
    a.target_scope_item_id AS target_item_id,
    a.target_slot_name AS target_slot,
    a.suggested_value,
    NULL::text AS current_value_snapshot,
    a.match_kind,
    a.confidence,
    a.status,
    a.context_snippet,
    a.decision_note,
    a.is_starred,
    a.viewed_at,
    a.created_at,
    a.decided_at,
    a.decided_by,
    a.suppressed_until,
    org.name AS org_name,
    org.slug AS org_slug,
    sc.scope_type_id,
    sc.type_label_singular AS scope_type_label,
    sc.type_slug AS scope_type_slug,
    sc.type_icon AS scope_type_icon,
    sc.scope_name,
    sc.scope_slug,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.scope_association_suggestions a
     LEFT JOIN LATERAL public._ctx_scope_facts(a.target_scope_id) sc ON true
     LEFT JOIN iam.organizations org ON org.id = a.organization_id
     LEFT JOIN LATERAL public._ctx_item_facts(a.target_scope_item_id) ci ON true
  WHERE a.deleted_at IS NULL;
grant select on public.v_scope_suggestions_from_store to authenticated, service_role;
comment on view public.v_scope_suggestions_from_store is 'SCOPES-READS-REST (2026-09-29): public.v_scope_suggestions with its scope / scope type / context item columns read from the record store (same columns, same row security). Built beside the older view; SCOPES-CONTRACT swaps it in at the window (scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql).';

create or replace view public.v_scope_suggestions_new_from_store with (security_invoker = true) as
SELECT s.id,
    s.user_id,
    s.organization_id,
    s.source_kind,
    s.source_id,
    s.scope_type_id,
    s.scope_type_label,
    s.suggested_name,
    s.suggested_slot_values,
    s.reasoning,
    s.confidence,
    s.status,
    s.created_at,
    s.decided_at,
    s.decided_by,
    s.suppressed_until,
    st.label_singular AS resolved_scope_type_label,
    st.icon AS scope_type_icon,
    st.slug AS scope_type_slug
   FROM rag.scope_suggestions s
     LEFT JOIN LATERAL public._ctx_scope_type_facts(s.scope_type_id) st(label_singular, label_plural, icon, slug) ON true;
grant select on public.v_scope_suggestions_new_from_store to authenticated, service_role;
comment on view public.v_scope_suggestions_new_from_store is 'SCOPES-READS-REST (2026-09-29): public.v_scope_suggestions_new with its scope / scope type / context item columns read from the record store (same columns, same row security). Built beside the older view; SCOPES-CONTRACT swaps it in at the window (scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql).';
