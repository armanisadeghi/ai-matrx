-- target: branch,production
-- additive: yes
--   It ADDS three new functions — `platform.resolve_id(uuid, text)` (the one door),
--   `custom.where_id_opens(uuid)` (the record store's half of it) and
--   `custom._where_id_may_open(uuid, uuid, permission_level)` (a private helper no client is
--   granted) — and the two `platform.client_callable_door` rows that declare the two doors.
--   No table, column, trigger, policy or existing function is touched; nothing is replaced,
--   dropped or revoked; nothing is written. The EXECUTE grants are their own chair-step file,
--   `openbyid_the_resolver_can_be_reached.sql`.
--   The inverse is `migrations/inverse/openbyid_one_address_opens_any_id_down.sql`.
-- guard: custom/system_enabled
--   Named because a production-headed file must name a real knob. Nothing here replaces a live
--   body or reads an existing path differently, so there is nothing for the knob to hold off:
--   until the grant file lands, no client can call either door, and after it lands the only
--   thing that calls them is the new address `/o/<id>`.
--
-- LANE ROUTE-RESOLVER — ONE ADDRESS THAT OPENS ANY ID THE PLATFORM MINTS.
--
-- THE USE CASE. Marisol Vega runs the front desk at Cedar Ridge Veterinary Clinic. Her inbox,
-- her Monday digest, an agent's answer and a share email from the emergency hospital across town
-- all send her links. Each producer had to know which of eleven screens its id belonged on, and
-- which organization to open it in — and when it guessed, she landed on "This table is not
-- here" for a table she owns, because the screen read whichever organization she had selected.
-- The owner, 2026-09-23: "instead of doing data-v2, it might be best to use a more intelligent
-- routing system that will always work and make it easier for all features." And his law:
-- access is to the PERSON; the active organization never decides whether a record opens.
--
-- WHAT THE DOOR ANSWERS, for one id and the person asking:
--   { state: 'opens',     kind, organization_id, path, sides? }   the screen, stamped with the
--                                                                  OBJECT's organization
--   { state: 'in_trash',  kind, organization_id, says }            theirs, and archived
--   { state: 'no_screen', kind, organization_id, says }            theirs, and no screen of its own
--   { state: 'no_such_side', kind, organization_id, sides, says }  ?side= asked for a side that is not there
--   { state: 'not_yours', says }                                   no such id, OR not theirs —
--                                                                  the same words, so nothing leaks
--
-- WHICH RULE DECIDES "THEIRS", per kind — always the object's OWN read door's rule, never a
-- second copy of it:
--   record store (Table, record, dashboard, digest rule, form, booking page, portal, rendered
--     document) — custom.assert_client_may_reach + custom.assert_client_may_open on the thing
--     the object's own door walls on (a form's and a dashboard's wall is its Table, exactly as
--     custom.forms and custom.dashboards ask; a digest adds custom.subscriptions' recipient/admin
--     clause; a portal's wall is its clients Table, as custom.list_portals asks; a rendered
--     document's is its record, as custom.doc_render_read asks). The organization is read from
--     the ROW, so a table shared in from another organization opens as that organization's.
--   older datasets, documents, conversations, scopes, context items — the table's own row
--     security, because platform.resolve_id is SECURITY INVOKER and simply SELECTs the row as
--     the person. Whatever those tables' policies say today is the answer, by construction.
--
-- THE TWO SIDES OF A TABLE (no redirect between systems). An id that is an older dataset opens
-- /data/<id>; an id that is a record-store Table opens /data-v2/<id>. A table moved by the
-- mover carries the SAME id in both stores with the older copy archived, so the live side wins;
-- when both are live, or neither, the older screen opens, because the id was minted there.
-- `?side=new` / `?side=old` asks for one side to compare, and is answered only when that side
-- exists for this person (`no_such_side` otherwise, with `sides` saying which do).

create function custom._where_id_may_open(p_organization_id uuid,
                                          p_subject_id uuid,
                                          p_required public.permission_level default 'viewer')
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  -- A wall on nothing admits nobody: custom.assert_client_may_open lets a null or foreign
  -- subject through (its door raises its own "not here" a line later), and this function has
  -- no line later.
  if p_organization_id is null or p_subject_id is null then
    return false;
  end if;
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = p_subject_id) then
    return false;
  end if;
  -- THE STORE'S OWN TWO QUESTIONS, in its own order: the organization wall, then the ladder.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.resolve_id');
  perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'platform.resolve_id',
                                        p_required, 'record');
  return true;
exception
  when insufficient_privilege or null_value_not_allowed then
    return false;
end;
$fn$;

comment on function custom._where_id_may_open(uuid, uuid, public.permission_level) is
  'Private to custom.where_id_opens: may the signed-in person open this subject, asked with the '
  'store''s own custom.assert_client_may_reach + custom.assert_client_may_open and answered as a '
  'boolean instead of a refusal. Granted to no client.';

create function custom.where_id_opens(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me       uuid := custom.query_principal();
  v_tables   uuid := custom.table_kernel_id();
  v_shows    uuid := custom.presentation_kernel_id();
  v_id       uuid := p_id;
  v_org      uuid;
  v_table    uuid;
  v_class    text;
  v_data     jsonb;
  v_live     boolean;
  v_quar     boolean;
  v_wall     uuid;
  v_kind     text;
  v_path     text;
  v_first    uuid;
  v_booking  boolean;
begin
  -- A signed-out caller is nobody's; the anonymous doors of this store decide their own requests.
  if p_id is null or v_me is null then
    return null;
  end if;

  -- ── 1. A RECORD OF THE STORE — a Table, a record, a dashboard, a digest rule ───────────────
  select r.organization_id, r.table_id, r.data_class, r.data, r.deleted_at is null,
         coalesce(r.metadata ->> 'quarantine', 'false') = 'true'
    into v_org, v_table, v_class, v_data, v_live, v_quar
    from custom.record r
   where r.id = p_id
   limit 1;

  if v_org is null then
    -- A MERGED ID ANSWERS WITH ITS SURVIVOR, as custom.record_resolve does: the old id is not a
    -- secret; what it resolves to is a record, decided on the one ladder like any other.
    select a.organization_id, a.new_id into v_org, v_id
      from custom.record_alias a
     where a.old_id = p_id and a.revoked_at is null
     limit 1;
    if v_org is not null then
      select r.table_id, r.data_class, r.data, r.deleted_at is null,
             coalesce(r.metadata ->> 'quarantine', 'false') = 'true'
        into v_table, v_class, v_data, v_live, v_quar
        from custom.record r
       where r.organization_id = v_org and r.id = v_id;
      if not found then
        v_org := null;
      end if;
    end if;
  end if;

  if v_org is not null then
    if v_table = v_tables then
      v_kind := 'table';      v_wall := v_id;
      v_path := '/data-v2/' || v_id::text;
    elsif v_table = v_shows and v_class = custom.dashboard_class() then
      -- custom.dashboards: ONE WALL, AND IT IS THE TABLE'S.
      v_kind := 'dashboard';  v_wall := nullif(v_data ->> 'subject_table_id', '')::uuid;
      v_path := '/data-v2/' || v_wall::text || '?dashboard=' || v_id::text;
    elsif v_class = 'rule' and v_data ? 'subscription' then
      -- custom.subscriptions: the Table, and then the recipient or an admin of the Table.
      v_kind := 'digest';     v_wall := nullif(v_data ->> 'scope_table_id', '')::uuid;
      if not (nullif(v_data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
              or custom._where_id_may_open(v_org, v_wall, 'admin'::public.permission_level)) then
        return null;
      end if;
      v_path := '/data-v2/' || v_wall::text || '?rail=notifications&item=' || v_id::text;
    elsif exists (select 1 from custom.record k
                   where k.id = v_table and k.table_id = v_tables and k.data_class = 'kernel') then
      -- A Field, a Rule, a Person row: part of how a table is built. Real, and screenless.
      v_kind := 'table_part'; v_wall := v_id;
      v_path := null;
    else
      -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
      if v_quar then
        return null;
      end if;
      v_kind := 'record';     v_wall := v_id;
      v_path := '/data-v2/' || v_table::text || '?record=' || v_id::text;
    end if;

  else
    -- ── 2. A FORM OR A BOOKING PAGE — custom.forms / custom.bookings wall on the Table ───────
    select f.organization_id, f.table_id, f.deleted_at is null, coalesce(f.presentation ? 'booking', false)
      into v_org, v_wall, v_live, v_booking
      from custom.anon_form f
     where f.id = p_id;
    if v_org is not null then
      v_kind := case when v_booking then 'booking' else 'form' end;
      v_path := '/data-v2/' || v_wall::text || '?rail=' || case when v_booking then 'bookings' else 'forms' end
                || '&item=' || p_id::text;
    else
      -- ── 3. A PORTAL — custom.list_portals walls on its clients Table ─────────────────────
      select p.organization_id, p.client_table_id, p.archived_at is null
        into v_org, v_wall, v_live
        from custom.portal p
       where p.id = p_id;
      if v_org is not null then
        v_kind := 'portal';
        -- The row opens on a table the portal SHOWS, as the hub's Portals row does: its clients
        -- table's own rail truthfully says the portal is not part of it (VERIFIER-15 H5).
        select pt.table_id into v_first
          from custom.portal_table pt
          left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
         where pt.portal_id = p_id
         order by coalesce(t.data ->> 'name', ''), pt.table_id
         limit 1;
        v_path := '/data-v2/' || coalesce(v_first, v_wall)::text || '?rail=portals&item=' || p_id::text;
      else
        -- ── 4. A RENDERED DOCUMENT — custom.doc_render_read walls on its record ────────────
        select d.organization_id, d.record_id, d.deleted_at is null
          into v_org, v_wall, v_live
          from custom.doc_render d
         where d.id = p_id;
        if v_org is null then
          return null;
        end if;
        v_kind := 'rendered_document';
        v_path := '/d/' || p_id::text;
      end if;
    end if;
  end if;

  if not custom._where_id_may_open(v_org, v_wall) then
    return null;
  end if;

  return jsonb_build_object(
    'kind',            v_kind,
    'organization_id', v_org,
    'path',            v_path,
    'live',            coalesce(v_live, true),
    'resolved_id',     v_id);
end;
$fn$;

comment on function custom.where_id_opens(uuid) is
  'The record store''s half of platform.resolve_id: for one id — a Table, a record, a dashboard, '
  'a digest rule, a form, a booking page, a portal or a rendered document — its kind, the '
  'organization it LIVES in (read from the row, never the caller''s selection) and the screen '
  'that opens it, or null when there is no such id OR the person may not open it (the same null, '
  'so nothing leaks). Every wall is the object''s own door''s wall.';

create function platform.resolve_id(p_id uuid, p_side text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog'
as $fn$
declare
  v_side      text := lower(nullif(btrim(coalesce(p_side, '')), ''));
  v_store     jsonb;
  v_has_new   boolean;
  v_has_old   boolean;
  v_old_org   uuid;
  v_old_live  boolean;
  v_pick      text;
  v_kind      text;
  v_org       uuid;
  v_path      text;
  v_live      boolean := true;
  v_type      uuid;
  v_sides     jsonb;
  c_not_yours constant text :=
    'This link does not open anything for the account you are signed in with. It may belong to '
    'somebody else, or it may have been mistyped. Check which account you are signed in as, or '
    'ask whoever sent it to share it with you.';
begin
  if p_id is null then
    raise exception 'platform.resolve_id: which id?' using errcode = '22004';
  end if;
  if v_side is not null and v_side not in ('new', 'old') then
    raise exception 'A table has an older side and a new side, and "%" is neither.', p_side
      using errcode = '22023',
            hint = 'Ask for side=new or side=old, or leave it out to open the one the id lives on.';
  end if;
  if (select auth.uid()) is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  -- The record store answers for its own objects, walled by its own doors.
  v_store := custom.where_id_opens(p_id);

  -- The older store answers through its own row security: this function is SECURITY INVOKER,
  -- so the SELECT below sees exactly the datasets /data/<id> itself would read.
  select d.organization_id, d.deleted_at is null
    into v_old_org, v_old_live
    from workbench.udt_datasets d
   where d.id = p_id;
  v_has_old := found;
  v_has_new := v_store is not null and v_store ->> 'kind' = 'table';

  if v_has_old or v_has_new then
    v_sides := jsonb_build_object('old', v_has_old, 'new', v_has_new);
    if (v_side = 'new' and not v_has_new) or (v_side = 'old' and not v_has_old) then
      return jsonb_build_object(
        'state', 'no_such_side', 'kind', 'table',
        'organization_id', case when v_has_new then (v_store ->> 'organization_id')::uuid else v_old_org end,
        'sides', v_sides,
        'says', case v_side
                  when 'new' then 'This table has no new side yet: it is still only in the older tables. Open it without side= to see it there.'
                  else 'This table has no older side: it was made in the new tables. Open it without side= to see it.'
                end);
    end if;
    v_pick := coalesce(v_side,
                case
                  when v_has_new and v_has_old then
                    case when coalesce((v_store ->> 'live')::boolean, true) and not v_old_live
                         then 'new' else 'old' end
                  when v_has_new then 'new'
                  else 'old'
                end);
    if v_pick = 'new' then
      v_kind := 'table';
      v_org  := (v_store ->> 'organization_id')::uuid;
      v_path := v_store ->> 'path';
      v_live := coalesce((v_store ->> 'live')::boolean, true);
    else
      v_kind := 'older_table';
      v_org  := v_old_org;
      v_path := '/data/' || p_id::text;
      v_live := v_old_live;
    end if;
    -- Asked for by name, a side opens even archived: comparing is the point of asking.
    if v_side is not null then
      v_live := true;
    end if;

  elsif v_side is not null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);

  elsif v_store is not null then
    v_kind := v_store ->> 'kind';
    v_org  := (v_store ->> 'organization_id')::uuid;
    v_path := v_store ->> 'path';
    v_live := coalesce((v_store ->> 'live')::boolean, true);

  else
    -- Everything else, asked as the person through each table's own row security.
    select 'document', d.organization_id, '/documents/' || d.id::text, d.deleted_at is null
      into v_kind, v_org, v_path, v_live
      from workbench.udt_documents d where d.id = p_id;
    if v_kind is null then
      select 'conversation', c.organization_id, '/chat/' || c.id::text, c.deleted_at is null
        into v_kind, v_org, v_path, v_live
        from chat.conversation c where c.id = p_id;
    end if;
    if v_kind is null then
      select 'scope', s.organization_id, '/scopes/s/' || s.id::text, s.deleted_at is null
        into v_kind, v_org, v_path, v_live
        from context.scopes s where s.id = p_id;
    end if;
    if v_kind is null then
      select 'context_item', st.organization_id, ci.scope_type_id,
             ci.deleted_at is null and coalesce(ci.is_active, true)
        into v_kind, v_org, v_type, v_live
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id
       where ci.id = p_id;
      if v_kind is not null then
        v_path := '/organizations/' || v_org::text || '/scopes/' || v_type::text
                  || '/context-items/' || p_id::text;
      end if;
    end if;
  end if;

  if v_kind is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  if v_path is null then
    return jsonb_build_object(
      'state', 'no_screen', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This is part of how a table is built — a column, a rule or a person row — and it has no screen of its own. Open the table it belongs to.');
  end if;

  if not v_live then
    return jsonb_build_object(
      'state', 'in_trash', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This was archived. Nothing was deleted: it can be brought back from where it lived.');
  end if;

  -- THE OBJECT'S ORGANIZATION, NAMED ON THE ADDRESS, through the platform's one rule for it
  -- (platform.link_carries_its_organization, `?org=`) — never the caller's selection.
  if v_org is not null then
    v_path := platform.link_carries_its_organization(v_path, v_org);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'opens', 'kind', v_kind, 'organization_id', v_org, 'path', v_path,
    'sides', v_sides));
end;
$fn$;

comment on function platform.resolve_id(uuid, text) is
  'THE ONE ADDRESS''S DOOR (/o/<id>). Any id the platform mints — a record-store table or record, '
  'an older dataset, a dashboard, a digest, a form, a booking page, a portal, a rendered document, '
  'a document, a conversation, a scope or a context item — answered with its kind, the '
  'organization it LIVES in and the screen that opens it (stamped ?org= with THAT organization), '
  'only for things the person may open under each object''s own read rule; otherwise not_yours, '
  'in the same words whether the id exists or not. p_side = new|old opens one side of a table to '
  'compare. SECURITY INVOKER, so every non-store kind is decided by that table''s own row security.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'resolve_id',
   'p_id uuid, p_side text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'SECURITY INVOKER. It decides nothing itself: the record store''s objects are answered by custom.where_id_opens under the store''s own walls, and every other kind is a SELECT of one row by id as the signed-in person, so that table''s row security is the whole answer. A signed-out caller, an id that does not exist and an id the person may not open all get the same not_yours sentence, so it confirms no id''s existence. It writes nothing.',
   'openbyid_one_address_opens_any_id.sql',
   null,
   true, false),
  ('custom', 'where_id_opens',
   'p_id uuid',
   array['uuid'::regtype]::oid[],
   'Returns null for a signed-out caller. Finds the id''s row by id alone, then asks custom.assert_client_may_reach and custom.assert_client_may_open (through custom._where_id_may_open) on exactly the subject the object''s own read door walls on — the Table for a form, booking page or dashboard; the Table plus recipient-or-admin for a digest; the clients Table for a portal; the record for a record or rendered document. Refused or missing, it returns the same null. It returns a kind, the owning organization and a path, never a name, a field or a value. It writes nothing.',
   'openbyid_one_address_opens_any_id.sql',
   null,
   true, false)
on conflict do nothing;
