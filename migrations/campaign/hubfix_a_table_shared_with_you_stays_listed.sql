-- target: branch,production
-- additive: yes
--   It ADDS one new function — `custom.tables_shared_with_me()` — and its
--   `platform.client_callable_door` row, and nothing else. No table, column, trigger, policy
--   or grant is touched; nothing existing is replaced, dropped or revoked; no row of anybody's
--   data is written. No business-shaped table is created, so the provisioner is not involved.
--   The grant is its own file, `hubfix_the_shared_tables_door_can_be_reached.sql`.
--   The inverse is `migrations/inverse/hubfix_a_table_shared_with_you_stays_listed_down.sql`.
-- guard: custom/system_enabled
--
-- LANE HUB-FIX — VERIFIER-15 H6: "After you accept a share, it disappears from the hub."
--
-- THE USE CASE. Rincon Plumbing Co — Ojai Branch shares its Jobs table, read-only, with the
-- property manager at a building it services; she has no membership of Rincon and never
-- will. She accepts the invitation, reads Jobs, and closes the tab. Tomorrow she opens
-- /data-v2 again to see whether the water heater job moved. Today she finds nothing: the
-- hub's "Shared with me" read `custom.table_share_outside_for_me()`, which answers PENDING
-- invitations only, so the moment she accepted, the one row that led to the table left the
-- page, and the only way back was the already-used invitation link in her email.
--
-- WHAT A SHARE IS, ONCE ACCEPTED. `custom.table_share_outside_accept` writes an
-- `iam.permissions` row — `resource_type = 'record'`, `resource_id` = the Table's own record
-- in the Table kernel, `granted_to_user_id` = her — and THAT GRANT IS THE ADMISSION
-- (`custom.portal_admits`, arm 2). So "what have other organizations shared with me" is
-- exactly: live grants addressed to me, on a Table record, in an organization I am not a
-- member of. This door answers that and nothing else.
--
-- WHAT IT NEVER DOES.
--   * It answers only about the caller (`custom.query_principal()`), never about anybody else.
--   * It lists only Tables — a grant on a single record of somebody's is not a table shared
--     with you, and naming that record's table would teach you a table exists.
--   * It lists only organizations the caller is NOT a member of. A member's tables are on
--     their own organization's hub; listing them here too would be the same table twice.
--   * It says, per row, whether the table will actually open (`opens`), because the owning
--     organization may have closed its outside door (`custom/external_principal_enabled`)
--     since — and when it will not, `say` gives the reason instead of a row that opens
--     nothing.

create function custom.tables_shared_with_me()
returns table(table_id uuid, organization_id uuid, organization text, table_name text,
              level text, level_label text, shared_at timestamptz, opens boolean, say text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  if v_me is null then return; end if;

  return query
    select t.id,
           t.organization_id,
           coalesce(o.name, 'An organization'),
           coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
           g.permission_level::text,
           iam.level_label('table', g.permission_level),
           g.created_at,
           custom.portal_admits(t.organization_id, v_me),
           case
             when custom.portal_admits(t.organization_id, v_me)
               then format('%s shared %s with you. You can open it as a %s; nothing else of theirs is yours to see.',
                           coalesce(o.name, 'An organization'),
                           coalesce(nullif(t.data ->> 'name', ''), 'a table'),
                           g.permission_level::text)
             else format('%s shared %s with you, and has since closed its door to people outside it, so it will not open right now. Ask them to open it again.',
                         coalesce(o.name, 'An organization'),
                         coalesce(nullif(t.data ->> 'name', ''), 'a table'))
           end
      from iam.permissions g
      join custom.record t
        on t.id = g.resource_id
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
      left join iam.organizations o on o.id = t.organization_id
     where g.resource_type = 'record'
       and g.granted_to_user_id = v_me
       and g.status = 'active'
       and (g.expires_at is null or g.expires_at > now())
       and not exists (
         select 1 from iam.organization_member m
          where m.organization_id = t.organization_id
            and m.user_id = v_me)
     order by g.created_at desc;
end;
$fn$;

comment on function custom.tables_shared_with_me() is
  'The Tables other organizations have shared with the person signed in and that person has '
  'ACCEPTED: live iam.permissions grants addressed to them on a Table-kernel record, in an '
  'organization they are not a member of. The pending half is custom.table_share_outside_for_me. '
  'Answers only about the caller; `opens` says whether the owner''s outside door is still open, '
  'and `say` is the sentence when it is not.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'tables_shared_with_me',
        '',
        array[]::oid[],
        'Takes no argument and answers only about custom.query_principal(), the person signed in: grants addressed to them, on a Table record, in an organization they are not a member of. It returns the Table''s id, name and organization name — facts the grant itself already hands that person, since accepting it is what lets them open the Table — and no record of the Table, no other grantee and no token. It writes nothing.',
        'hubfix_a_table_shared_with_you_stays_listed.sql',
        null,
        true, false)
on conflict do nothing;
