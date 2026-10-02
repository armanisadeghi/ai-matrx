-- CHAIR (Unified Data System v6) — PUBLISH BINDINGS FOR VIEWS AND PAGES (lane 2 wave 6, lane 11 D2).
--
-- THE USE CASE. Cedar Ridge Physical Therapy publishes its "Open class times" view and its
-- "Fall clinic" page. A stranger opens aimatrx.com/p/cedar-ridge-class-times and the page knows,
-- from the address alone, that it holds a VIEW of the Classes table (so it reads that view's rows
-- with its filters and hidden columns) — or a PAGE (a canvas of blocks) — or a table, a record or a
-- dashboard. Today it cannot: iam.resolve_publish_binding answers resource_type 'record' for every
-- row of the store, and records-ui's publicReadOf answers "unknown" for all of them
-- (records-ui src/publicBinding.ts: "iam.resolve_publish_binding does not return it yet (the
-- chair's door)").
--
-- THE DESIGN (one rule, no new access):
--   · The binding stays iam.publish_binding, created by iam.publish_binding_create — which already
--     takes any resource type, judges the caller's top content level, the world lane and the
--     external-principal knob. A store object keeps the ONE entity token of custom.record,
--     'record' (iam.lane_of / effective_level know it); a saved view keeps its own,
--     'platform_saved_view'. No 'canvas' token is coined (lane 11 asked for one): a page IS a
--     dashboard record whose presentation.kind is 'page', and its kind travels in the answer.
--   · WHAT it is comes back with the address: iam.resolve_publish_binding_kind(slug) (in iam, beside
--     the door it wraps, because a signed-out stranger reaches iam and never custom) answers the
--     binding plus `kind` (table | record | dashboard | page | view), `table_id` (the table a
--     view, record or dashboard reads; a table's own id) and `title`. Same rule as the door it
--     wraps: the decision is taken before existence, so a revoked address, an archived object and
--     an address that never existed answer identically — zero rows, the 404.
--   · Binding one is custom.publish_bind(org, kind, id, slug, render_mode): it checks the object is
--     that kind and lives in that organization, then calls iam.publish_binding_create, which judges
--     the person. It never enters the world lane itself (iam.publish_to_world is not a client door
--     and stays that way), so on production today — world lane and public addresses both closed —
--     it answers those doors' own refusals, verbatim.
--
-- WHAT THIS FILE LANDS (pure addition): two functions, their door rows, EXECUTE through
-- custom.reopen_declared_doors(). Nothing existing changes.
--
-- INVERSE: migrations/inverse/chair_pb_a_view_or_a_page_gets_a_public_address_down.sql
--
-- chair-step: two new doors — iam.resolve_publish_binding_kind (signed-in and signed-out callers, like iam.resolve_publish_binding it wraps) and custom.publish_bind (signed-in) — with their platform.client_callable_door rows; EXECUTE on the resolver is granted to anon and authenticated (as on iam.resolve_publish_binding) and custom.reopen_declared_doors() opens publish_bind to authenticated. No table, no policy, no existing grant changes.
-- lock: custom,iam
-- lane: CHAIR-TEMPLATE-FAMILY


create or replace function iam.resolve_publish_binding_kind(p_slug text)
 returns table(slug text, resource_type text, resource_id uuid, organization_id uuid, render_mode text,
               namespace text, notice text, kind text, table_id uuid, title text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select b.slug, b.resource_type, b.resource_id, b.organization_id, b.render_mode, b.namespace, b.notice,
         case
           when b.resource_type = 'platform_saved_view' then 'view'
           when r.data_class = 'dashboard' and r.data -> 'presentation' ->> 'kind' = 'page' then 'page'
           else r.data_class
         end,
         case
           when b.resource_type = 'platform_saved_view' then v.subject_id
           when r.data_class = 'table' then r.id
           when r.data_class = 'dashboard' then nullif(r.data ->> 'subject_table_id', '')::uuid
           else r.table_id
         end,
         coalesce(v.name, r.data ->> 'name', r.data ->> 'title')
    from iam.resolve_publish_binding(p_slug) b
    left join custom.record r
      on b.resource_type = 'record' and r.organization_id = b.organization_id and r.id = b.resource_id
     and r.deleted_at is null and r.data_class in ('table', 'record', 'dashboard')
    left join platform.saved_view v
      on b.resource_type = 'platform_saved_view' and v.organization_id = b.organization_id and v.id = b.resource_id
     and v.deleted_at is null
   where (b.resource_type = 'record' and r.id is not null)
      or (b.resource_type = 'platform_saved_view' and v.id is not null)
$function$;
comment on function iam.resolve_publish_binding_kind(text) is
  'Chair (v6) — a public address, resolved with WHAT it holds: iam.resolve_publish_binding''s row plus kind (table | record | dashboard | page | view), table_id (the table it reads) and title. Zero rows for a revoked, archived, never-made or non-store address alike (the 404). Answers the same for everybody.';

create or replace function custom.publish_bind(p_organization_id uuid, p_kind text, p_resource_id uuid, p_slug text, p_render_mode text default 'page')
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_type text;
  v_ok   boolean;
  v_row  iam.publish_binding;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.publish_bind');
  if coalesce(p_kind, '') not in ('table', 'record', 'dashboard', 'page', 'view') then
    raise exception 'A public address can point at a table, a record, a dashboard, a page or a view; "%" is none of those.', coalesce(p_kind, '(none)')
      using errcode = '22023';
  end if;
  if p_kind = 'view' then
    v_type := 'platform_saved_view';
    select true into v_ok from platform.saved_view v
     where v.organization_id = p_organization_id and v.id = p_resource_id and v.deleted_at is null;
  else
    v_type := 'record';
    select true into v_ok from custom.record r
     where r.organization_id = p_organization_id and r.id = p_resource_id and r.deleted_at is null
       and r.data_class = case when p_kind = 'page' then 'dashboard' else p_kind end
       and (p_kind <> 'page' or r.data -> 'presentation' ->> 'kind' = 'page');
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'There is no such % in this organization to give a public address.', p_kind using errcode = 'P0002';
  end if;
  v_row := iam.publish_binding_create(p_slug, v_type, p_resource_id, p_organization_id, coalesce(p_render_mode, 'page'));
  return to_jsonb(v_row) || jsonb_build_object('kind', p_kind);
end;
$function$;
comment on function custom.publish_bind(uuid, text, uuid, text, text) is
  'Chair (v6) — give a table, record, dashboard, page or saved view of one organization a public address: checks the object is that kind there, then iam.publish_binding_create judges the person (top content level, world lane, public addresses open). Never enters the world lane itself.';

revoke all on function iam.resolve_publish_binding_kind(text) from public;
revoke all on function custom.publish_bind(uuid, text, uuid, text, text) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, anonymous_purpose, argument_rules)
values
  ('iam', 'resolve_publish_binding_kind', 'p_slug text', array['text'::regtype]::oid[],
   'Resolves a public address to what it holds (kind, table, title) on top of iam.resolve_publish_binding, which takes the access decision: only active bindings to objects in the world lane answer.',
   'chair_pb_a_view_or_a_page_gets_a_public_address.sql', null, true, true,
   'A public page is opened by people with no account: the address resolves the same for everybody or it is not public, exactly as iam.resolve_publish_binding does.',
   jsonb_build_object('version', 1, 'declared_by', 'chair_pb_a_view_or_a_page_gets_a_public_address.sql',
     'declared_at', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY',
     'arguments', jsonb_build_object(
       'p_slug', jsonb_build_object('type', 'text', 'position', 1,
         'check', 'resolved only through iam.resolve_publish_binding (active binding, world lane).',
         'foreign', jsonb_build_object('note', 'a revoked, archived or never-made address answers zero rows alike.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body')))),
  ('custom', 'publish_bind', 'p_organization_id uuid, p_kind text, p_resource_id uuid, p_slug text, p_render_mode text',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'Gives one table, record, dashboard, page or saved view of the organization a public address: custom.assert_client_may_reach first, then iam.publish_binding_create judges the caller.',
   'chair_pb_a_view_or_a_page_gets_a_public_address.sql', null, true, false, null,
   jsonb_build_object('version', 1, 'declared_by', 'chair_pb_a_view_or_a_page_gets_a_public_address.sql',
     'declared_at', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'),
       'p_resource_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'custom_record',
         'check', 'matched only with organization_id = arg1 and the kind named; then iam.publish_binding_create judges the caller''s level on it.',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'))))
on conflict do nothing;

-- The resolver's grant is the one iam.resolve_publish_binding carries (door row above, then the grant).
grant execute on function iam.resolve_publish_binding_kind(text) to anon, authenticated;
select custom.reopen_declared_doors();
