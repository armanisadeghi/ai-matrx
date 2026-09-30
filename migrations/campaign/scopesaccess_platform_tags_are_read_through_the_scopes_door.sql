-- chair-step: lane SCOPES-READS-ACCESS (chair ruling 2026-09-29 (1): "do NOT open the organization wall for a whole system organization (329 data Tables). Narrow it: the wall admits a non-member's READ of a Table in a global-readable system organization only when that Table itself is at the store's world/platform-readable level (or offered_as_context, whichever the store already uses for system context items)"). Matrx System (a global-readable system organization) keeps the platform's tags; the old scope rules let every signed-in person read them; the store's ladder already says yes (custom.has_visibility, through the kernel's global-readable arm) but the organization wall refused anyone outside Matrx System. Now custom.table_is_platform_context(org, table) — a context Table (the copy already marks every one kept_for = context and offered_as_context = true) kept by a global-readable system organization — is the one question; custom.context_scopes reads such a Table for any signed-in person the ladder lets see it, the organization wall (custom.assert_client_may_reach) standing aside for that one read only (a transaction-local mark set and cleared around it, which no client can set). Every write door and every other Table of Matrx System meet the wall as before. Proof: scripts/campaign-tests/scopesaccess_platform_tags_are_read_through_the_scopes_door_red_green.sql (a person who belongs to no organization reads the platform tags — RED before — and still cannot know, list or read any other Table of Matrx System, nor rename a tag; an ordinary organization's tags stay closed). No DDL on any table, no rows.
-- based-on: custom.assert_client_may_reach(uuid, text) dd5c80c5635dee7a701798b0ebc2d8919523ebdc32766fbab3eedea6a84e831c
-- based-on: custom.context_scopes(uuid[]) 3a5dc26449f79023de0eeeaa04adbba6d235f1354926c2932b71a23dd4869208
-- lane: SCOPES-READS-ACCESS
-- INVERSE: migrations/inverse/scopesaccess_platform_tags_are_read_through_the_scopes_door_down.sql
-- window-class: function bodies; no DDL on any table.

-- THE ONE QUESTION: is this Table platform context — a context Table (the copy marks it kept_for = context and
-- offered_as_context = true) that a global-readable system organization keeps (iam.system_orgs.global_readable)?
-- Only such a Table is read by a person who belongs to no organization of it; every other Table of the same system
-- organization (its 329 data Tables) stays behind the organization wall.
create function custom.table_is_platform_context(p_organization_id uuid, p_table_id uuid)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select p_organization_id is not null and p_table_id is not null
     and exists (select 1 from iam.system_orgs so where so.organization_id = p_organization_id and so.global_readable)
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null
                    and t.data @> '{"kept_for": "context", "offered_as_context": true}'::jsonb)
$function$;
revoke all on function custom.table_is_platform_context(uuid, uuid) from public, anon, authenticated;

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
  -- A PLATFORM CONTEXT READ IN PROGRESS (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (1)). custom.context_scopes
  -- sets this for the length of ONE read of ONE platform context Table (custom.table_is_platform_context — a context
  -- Table of a global-readable system organization) the one ladder already lets the caller see, and clears it after;
  -- no client can set it (set_config is no client door). It admits nothing else: no memo is written, and every other
  -- door, Table and organization meets this wall as before.
  if nullif(current_setting('mx.platform_context_org', true), '') = p_organization_id::text then
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
    -- A PLATFORM CONTEXT TABLE (custom.table_is_platform_context: a context Table of a global-readable system
    -- organization, e.g. Matrx System's tags) is read by everyone signed in whom the one ladder lets know the Table;
    -- the organization wall stands aside for this one read of this one Table (mx.platform_context_org, cleared right
    -- after). Every other Table keeps the organization wall.
    if custom.table_is_platform_context(v_grp.org, v_grp.tbl) then
      perform set_config('mx.platform_context_org', v_grp.org::text, true);
      begin
        -- the Table's own wall: the one ladder must let this person know the Table, or it answers nothing
        perform custom.assert_may_know_table(v_grp.org, v_grp.tbl, 'custom.context_scopes');
      exception when insufficient_privilege then
        perform set_config('mx.platform_context_org', '', true);
        continue;
      end;
    else
      continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
      perform custom.assert_client_may_reach(v_grp.org, 'custom.context_scopes');
      continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
    end if;
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
    perform set_config('mx.platform_context_org', '', true);
  end loop;
  return v_out;
end;
$function$;
