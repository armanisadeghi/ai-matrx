-- platform_list_scope_registry_view_dd137c8 — THE CLIENT CAN ACTUALLY READ WHERE ITS LIST LANDS
-- (DD-137c, step 8; VISIBILITY-BY-CLASS §3.3).
--
-- 🚨 FOUND IN A BROWSER, AS A REAL NON-ADMIN, AND IT COULD NOT HAVE BEEN FOUND ANYWHERE ELSE.
-- `lib/list-scope` reads `platform.entity_types` directly to learn where a token's list opens.
-- Signed in as `test@test.com` — a plain member of two organizations — the shapes list printed its
-- own fallback into the console:
--
--     [list-scope] Could not read where this list should open (platform.entity_types), so it is
--     showing only your own rows. If the organization's data is missing from this screen, that is why.
--
-- The stand-in announced itself exactly as it was built to (law 4), and it fired on EVERY list for
-- EVERY user who is not a platform administrator. Measured with that person's real JWT against
-- PostgREST: `GET /rest/v1/entity_types?select=token&limit=3` with `Accept-Profile: platform`
-- returns `200 []`. Not an error — an empty registry, which the helper correctly refuses to treat as
-- "everything is mine" and which therefore lands every screen on `mine`.
--
-- The cause is one word in the catalogue: `platform.entity_types` carries THREE policies, and
--
--     platform_admin_only    polpermissive = FALSE    using: is_platform_admin()
--
-- is RESTRICTIVE. A restrictive policy ANDs with everything else, so the permissive `et_read`
-- (`is_platform_admin() OR auth.uid() IS NOT NULL`) can never grant a row to anyone who is not an
-- administrator. The registry is admin-only by design, and that design is correct — it carries the
-- data class of every table on the platform, the reason each class was chosen, and the audit shape
-- of each one.
--
-- WHAT IS ADDED, AND WHY IT IS A VIEW AND NOT A LOOSENED POLICY
-- -------------------------------------------------------------
-- Opening `platform.entity_types` to every signed-in user to publish ONE column would hand out the
-- whole security posture of the platform to read a landing place. So the landing place gets its own
-- door, and nothing else comes with it:
--
--     platform.list_scope_registry  ->  (token, default_list_scope)
--
-- for active tokens that declare one. It answers identically for every caller, it is a property of
-- the TABLE and never of a row, and it is the exact information §3.3 says a screen must have to open
-- in the right place. No class, no reason, no schema or table name, no audit shape.
--
-- Declared in `platform.client_callable_door` BEFORE the grant, because
-- `enforce_definer_client_grants` silently revokes an undeclared client grant on anything that runs
-- with borrowed rights (measured the hard way in DD-137c1).

create or replace view platform.list_scope_registry as
  select et.token,
         et.default_list_scope
    from platform.entity_types et
   where et.is_active
     and et.default_list_scope is not null;

comment on view platform.list_scope_registry is
  'DD-137c / VISIBILITY-BY-CLASS §3.3. Where each registered token''s list OPENS — the one column '
  'a client needs from the registry, and nothing else. platform.entity_types itself is admin-only '
  'by a RESTRICTIVE policy (correctly: it carries every table''s data class and the reason for it), '
  'so reading it from a browser returned an empty registry for every non-admin and every list fell '
  'back to `mine`. The answer here is identical for every caller and is a property of the table, '
  'never of a row.';

insert into platform.client_callable_door(schema_name, function_name, identity_args, declared_by, reason)
select 'platform', 'list_scope_registry', '(view)', 'DD-137c',
       'Where each token''s list opens (mine | organization), for lib/list-scope in the browser. '
       'Runs with the view owner''s rights because platform.entity_types is admin-only by a '
       'RESTRICTIVE policy. Exposes two columns, the same answer for every caller, and no data '
       'class, reason, schema, table or audit shape.'
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'platform' and d.function_name = 'list_scope_registry');

revoke all on platform.list_scope_registry from public;
grant select on platform.list_scope_registry to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════ PROOF — as the real account
do $$
declare
  v_test uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, a plain member
  v_direct int; v_view int; v_scope text; v_n int;
begin
  if not exists (select 1 from auth.users where id = v_test) then
    raise exception 'dd137c8: the non-admin test account is gone, so the thing this file fixes '
                    'cannot be measured as the person it was measured on.';
  end if;
  if public.is_platform_admin_for(v_test) then
    raise exception 'dd137c8: % is a platform admin, so it cannot prove the non-admin case', v_test;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_test::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- (a) THE DEFECT, re-measured rather than quoted: the table itself is empty for this person.
  select count(*) into v_direct from platform.entity_types;

  -- (b) AND THE VIEW ANSWERS.
  select count(*) into v_view from platform.list_scope_registry;
  select r.default_list_scope::text into v_scope
    from platform.list_scope_registry r where r.token = 'content_ir_kind';

  execute 'reset role';

  if v_direct <> 0 then
    raise exception 'dd137c8: a non-admin can now read % rows of platform.entity_types directly. '
                    'This file did not intend that and the registry must stay admin-only.', v_direct;
  end if;
  if v_view = 0 then
    raise exception 'dd137c8: the view answers a non-admin with nothing, so every list still falls '
                    'back to `mine` and nothing was fixed.';
  end if;
  if v_scope is distinct from 'organization' then
    raise exception 'dd137c8: content_ir_kind reads % through the view, not `organization` — the '
                    'screen this whole campaign came from would still open in the wrong place.',
                    coalesce(v_scope, 'nothing');
  end if;

  -- (c) AND ANONYMOUS GETS NOTHING AT ALL — a refusal, not an empty list.
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  begin
    select count(*) into v_n from platform.list_scope_registry;
    execute 'reset role';
    raise exception 'dd137c8: anon read % rows from the list-scope registry; it has no grant and '
                    'must be refused outright.', v_n;
  exception when insufficient_privilege then
    begin execute 'reset role'; exception when others then null; end;
  end;

  raise notice 'dd137c8 PROVEN: a plain member reads 0 rows of platform.entity_types and % rows of '
               'platform.list_scope_registry; content_ir_kind opens on %.', v_view, v_scope;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  raise;
end $$;
