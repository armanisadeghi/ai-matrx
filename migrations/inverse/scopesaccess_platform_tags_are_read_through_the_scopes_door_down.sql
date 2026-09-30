-- INVERSE of migrations/campaign/scopesaccess_platform_tags_are_read_through_the_scopes_door.sql (lane SCOPES-READS-ACCESS).
-- chair-step: puts back the organization wall and the scopes door as production held them (Matrx System's tags behind the organization wall again) and drops custom.table_is_platform_context.
-- based-on: custom.assert_client_may_reach(uuid, text) 4928729e8a1030094245e7e14b30772991b39a5b028b7d758770b9a279b1a06d
-- based-on: custom.context_scopes(uuid[]) 62c9ef80a1221b4541f3b08a4cbe3df2273aacad040626f804d84798f9a44749

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;

CREATE OR REPLACE FUNCTION custom.context_scopes(p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;
  if cardinality(v_ids) > 1000 then
    raise exception 'custom.context_scopes answers at most 1000 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 1000 or fewer.';
  end if;

  -- WHERE EACH ID OPENS IS READ FROM THE OBJECT ITSELF (a scope is a Record of a context Table), never
  -- from the caller's working organization. Each organization is decided in this door's name: one the
  -- caller cannot reach answers nothing for its ids (the old RLS's answer), and every document comes
  -- through custom.read_records_by_ids — the one ladder and the one read mask.
  for v_grp in
    select r.organization_id as org, r.table_id as tbl, array_agg(r.id) as ids
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = v_tables and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
     where r.id = any (v_ids) and r.deleted_at is null
     group by 1, 2
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_scopes');
    continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.ids, false) x
      )
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'scope_type_id', v_grp.tbl, 'organization_id', v_grp.org,
               'name', d.document -> 'name',
               'description', d.document -> coalesce((select f.data ->> 'key' from custom.record f
                                  where f.organization_id = v_grp.org
                                    and f.id = custom._ctx_id('scope-column-field', v_grp.tbl::text, 'description')), 'description'),
               'slug', d.document -> 'slug', 'sort_order', d.document -> 'sort_order',
               'parent_scope_id', d.document -> 'parent_id',
               'settings', custom._ctx_scope_settings(v_grp.org, v_grp.tbl, d.document),
               'created_by', h.created_by, 'created_at', h.created_at, 'updated_at', h.updated_at,
               'scope_type', jsonb_build_object(
                 'id', t.id, 'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
                 'icon', t.data -> 'icon', 'color', t.data -> 'color', 'slug', t.data -> 'slug')))
        from d
        join custom.record h on h.organization_id = v_grp.org and h.id = d.id
        join custom.record t on t.organization_id = v_grp.org and t.id = v_grp.tbl), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

drop function custom.table_is_platform_context(uuid, uuid);
