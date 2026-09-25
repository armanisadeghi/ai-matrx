-- inverse of migrations/campaign/suitehealth2_where_id_opens_decides_in_its_own_name.sql — restores custom.where_id_opens as applied by
-- suitehealth2_every_door_decides_in_its_own_body.sql.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.where_id_opens(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  -- THE DECISION, IN THIS BODY (lane SUITE-HEALTH-2): the store's own two questions in its own
  -- order — the organization wall, then the ladder — asked here rather than through
  -- custom._where_id_may_open, which asks exactly these two and nothing else. Same answer for
  -- every caller: a wall on nothing admits nobody, and a refusal is the same silence as an id
  -- that does not exist.
  if v_org is null or v_wall is null
     or not exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_wall) then
    return null;
  end if;
  begin
    perform custom.assert_client_may_reach(v_org, 'platform.resolve_id');
    perform custom.assert_client_may_open(v_org, v_wall, 'platform.resolve_id',
                                          'viewer'::public.permission_level, 'record');
  exception
    when insufficient_privilege or null_value_not_allowed then
      return null;
  end;

  return jsonb_build_object(
    'kind',            v_kind,
    'organization_id', v_org,
    'path',            v_path,
    'live',            coalesce(v_live, true),
    'resolved_id',     v_id);
end;
$function$;
