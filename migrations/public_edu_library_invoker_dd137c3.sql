-- public_edu_library_invoker_dd137c3 — THE EDUCATION LIBRARY RUNS AS ITS CALLER, AND FINALLY HAS AN
-- ORGANIZATION (DD-137c, step 3; VISIBILITY-BY-CLASS §3.3 chair R2).
--
-- WHY THIS ONE NEEDED ITS OWN FILE
-- --------------------------------
-- `edu_library_list_scoped` makes no scope decision of its own: it hands `p_scope` straight to
-- `public.edu_library_scope_rows(p_scope)` and that function decides everything. Converting only the
-- outer one would have moved the hand-written predicate down a level and let
-- `pnpm check:list-scope` go green over a function that still decides access by hand — a guard
-- satisfied by relocation is worse than a guard that is red, because it stops anybody looking.
-- So both convert here, together.
--
-- AND THE LIBRARY HAD NO ORGANIZATION AT ALL
-- ------------------------------------------
-- `edu_library_scope_rows` accepted exactly three words: `mine`, `shared`, `public`. There was NO
-- organization scope — four people in one organization each building flashcard decks, assessments,
-- study media and notes could see their own and anything explicitly granted to them, and had no way
-- at all to open the organization's library. Meanwhile all four of the tokens it unions
-- (`fc_set`, `assessment`, `study_media`, `note`) are registered `default_list_scope =
-- 'organization'`. The registry said "open on the organization" and the function could not even
-- spell the word. That is the same defect as the SEO screen, one layer further down.
--
-- So `orgs` is added, and it is the same shape as the nine in DD-137c2: no predicate of its own at
-- all. RLS on `education.fc_set`, `education.assessment`, `education.study_media` and
-- `workbench.notes` decides who reads what; this function only decides where the screen opens.
--
-- THE DEFAULT FOR A LIST THAT UNIONS FOUR TOKENS
-- ----------------------------------------------
-- §3.3's registry word is per TOKEN, and this one list shows four of them. The rule taken here is
-- the NARROWEST wins: the library opens on the organization only if EVERY token it unions says
-- `organization`. If one of them is later reclassified to `mine`, the library falls back to `mine`
-- rather than landing a token wider than its own registry row allows. It is computed from the
-- registry on every call — never copied into a literal here — so reclassifying a token moves this
-- screen with it.
--
-- `auth.users` becomes `platform.visible_user_identity` (DD-137c1) for the same reason as the nine:
-- `authenticated` has no SELECT on `auth.users`, so as an invoker this function would die at 42501.
-- It also means the `public` and `shared` scopes stop printing the email address of somebody the
-- viewer shares no organization with.

-- ═══════════════════════════════════════════════════════════ the rows, decided by RLS not by hand
create or replace function public.edu_library_scope_rows(p_scope text default 'mine'::text)
 returns table(id uuid, kind text, subtype text, title text, description text, status text,
               visibility text, created_by uuid, organization_id uuid, organization_name text,
               created_at timestamp with time zone, updated_at timestamp with time zone,
               is_owner boolean, access_level text, owner_email text)
 language plpgsql
 stable
 set search_path to ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  -- THE NARROWEST OF THE FOUR TOKENS THIS LIST UNIONS. `min` over ('mine','orgs') is 'mine', which
  -- is the rule spelled as arithmetic: one token that opens on itself keeps the whole library on
  -- itself. `platform.entity_default_list_scope` is the one mapper from the registry word
  -- `organization` to this vocabulary's `orgs` (§3.3 item 4 — we do not rename a live parameter
  -- vocabulary to make a new column prettier).
  v_default text := (
    SELECT min(platform.entity_default_list_scope(t))
      FROM unnest(ARRAY['fc_set','assessment','study_media','note']) AS t);
  v_scope text := lower(coalesce(p_scope, v_default));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'edu_library_scope_rows: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'edu_library_scope_rows: unknown scope %', v_scope USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT
      s.id AS u_id,
      'fc_set'::text AS u_kind,
      'flashcards'::text AS u_subtype,
      coalesce(nullif(s.name, ''), 'Untitled flashcard deck') AS u_title,
      coalesce(s.description, '') AS u_description,
      'ready'::text AS u_status,
      s.visibility::text AS u_visibility,
      s.created_by AS u_created_by,
      s.organization_id AS u_organization_id,
      s.created_at AS u_created_at,
      s.updated_at AS u_updated_at
    FROM education.fc_set s
    WHERE s.deleted_at IS NULL

    UNION ALL

    SELECT
      a.id,
      'assessment'::text,
      a.assessment_kind,
      coalesce(nullif(a.title, ''), 'Untitled assessment'),
      coalesce(a.description, ''),
      coalesce(nullif(a.status, ''), 'draft'),
      a.visibility::text,
      a.created_by,
      a.organization_id,
      a.created_at,
      a.updated_at
    FROM education.assessment a
    WHERE a.deleted_at IS NULL

    UNION ALL

    SELECT
      m.id,
      'study_media'::text,
      m.media_kind,
      coalesce(nullif(m.title, ''), 'Untitled study media'),
      coalesce(m.description, ''),
      coalesce(nullif(m.status, ''), 'draft'),
      m.visibility::text,
      m.created_by,
      m.organization_id,
      m.created_at,
      m.updated_at
    FROM education.study_media m
    WHERE m.deleted_at IS NULL

    UNION ALL

    SELECT
      n.id,
      'note'::text,
      'notes'::text,
      coalesce(nullif(n.label, ''), 'Untitled note'),
      coalesce(nullif(n.folder_name, ''), 'Study note'),
      'ready'::text,
      n.visibility::text,
      n.created_by,
      n.organization_id,
      n.created_at,
      n.updated_at
    FROM workbench.notes n
    WHERE n.deleted_at IS NULL
  ),
  scoped AS (
    SELECT
      u.*,
      true AS s_is_owner,
      'owner'::text AS s_access_level
    FROM unified u
    WHERE v_scope = 'mine'
      AND u.u_created_by = v_uid

    UNION ALL

    -- ORGS — NO PREDICATE. This arm is the whole point of DD-137c: the organization's library is
    -- whatever RLS already lets this person read, the viewer's own rows included. It carries no
    -- membership test (RLS decides membership), no visibility test (RLS decides visibility), and no
    -- `created_by IS DISTINCT FROM` (excluding your own work from "everyone's" is the bug).
    SELECT
      u.*,
      (u.u_created_by = v_uid),
      CASE WHEN u.u_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM unified u
    WHERE v_scope = 'orgs'

    UNION ALL

    SELECT
      u.*,
      false,
      'shared'::text
    FROM unified u
    WHERE v_scope = 'shared'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND EXISTS (
        SELECT 1
        FROM iam.permissions p
        WHERE p.resource_type = u.u_kind
          AND p.resource_id = u.u_id
          AND p.status = 'active'
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND (
            p.granted_to_user_id = v_uid
            OR p.granted_to_organization_id IN (
              SELECT om.organization_id
              FROM iam.organization_member om
              WHERE om.user_id = v_uid
            )
          )
      )

    UNION ALL

    SELECT
      u.*,
      false,
      'public'::text
    FROM unified u
    WHERE v_scope = 'public'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND u.u_visibility = 'public'
  )
  SELECT
    s.u_id,
    s.u_kind,
    s.u_subtype,
    s.u_title,
    s.u_description,
    s.u_status,
    s.u_visibility,
    s.u_created_by,
    s.u_organization_id,
    o.name,
    s.u_created_at,
    s.u_updated_at,
    s.s_is_owner,
    s.s_access_level,
    au.email::text
  FROM scoped s
  LEFT JOIN iam.organizations o ON o.id = s.u_organization_id
  LEFT JOIN platform.visible_user_identity au ON au.id = s.u_created_by;
END;
$function$;

comment on function public.edu_library_scope_rows(text) is
  'DD-137c (VISIBILITY-BY-CLASS §3.3). SECURITY INVOKER: RLS decides who reads what, this decides '
  'only where the library opens. Gained an `orgs` scope, which it never had, and its default is '
  'computed from the registry as the NARROWEST of the four tokens it unions.';

grant execute on function public.edu_library_scope_rows(text) to authenticated;

-- ═══════════════════════════════════════════════════ the list that wraps it, also as its caller
-- Only one thing changes: `STABLE SECURITY DEFINER` becomes `STABLE`. Every other byte is the
-- definition Postgres itself prints, so no signature, default, volatility or search_path moves.
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'edu_library_list_scoped';
  if v_def is null then
    raise exception 'dd137c3: public.edu_library_list_scoped does not exist';
  end if;
  v_new := replace(v_def, E'\n STABLE SECURITY DEFINER\n', E'\n STABLE\n');
  if v_new = v_def then
    raise exception 'dd137c3: edu_library_list_scoped is not `STABLE SECURITY DEFINER` — its header '
                    'changed under this file and it must be re-read, never patched blind.';
  end if;
  execute v_new;
end $$;

-- ═══════════════════════════════════════════════════════════════════ PROOF — live, real identities
do $$
declare
  v_p uuid; v_email text;
  v_n_orgs bigint; v_n_mine bigint; v_leak uuid[]; v_ids uuid[]; v_ceiling uuid[];
  v_measured int := 0; v_err text; v_notes text := '';
  v_principals uuid[] := array[
    'c5e92166-e148-4e73-926e-83af0c453665'::uuid,  -- seo@titaniumsuccess.com
    '392afd39-d59c-4418-866b-451e9d93fead'::uuid,  -- projectmanager@titaniumsuccess.com
    '34ed4fc3-c527-4819-99bf-15c26603b261'::uuid,  -- arman@titaniumsuccess.com
    '77c6af70-a35e-4724-a304-64a0dd789674'::uuid   -- elliesadeghijd@gmail.com
  ];
begin
  -- The default must be the registry's word, not a literal. All four tokens are `organization`
  -- today, so the library opens on the organization; if that stops being true this assertion says so.
  if (select min(platform.entity_default_list_scope(t))
        from unnest(array['fc_set','assessment','study_media','note']) t) <> 'orgs' then
    raise exception 'dd137c3: the education library''s four tokens no longer all open on the '
                    'organization — the default moved and this file''s premise needs re-reading.';
  end if;

  foreach v_p in array v_principals loop
    select u.email into v_email from auth.users u where u.id = v_p;
    v_err := null; v_ids := null; v_ceiling := null; v_n_orgs := 0; v_n_mine := 0;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_p::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';

      select coalesce(array_agg(x.id), '{}'), coalesce(max(x.total_count), 0)
        into v_ids, v_n_orgs
        from public.edu_library_list_scoped(p_scope => 'orgs', p_limit => 200) x;
      select coalesce(max(x.total_count), 0) into v_n_mine
        from public.edu_library_list_scoped(p_scope => 'mine', p_limit => 200) x;
      select coalesce(array_agg(c.id), '{}') into v_ceiling from (
        select s.id from education.fc_set s where s.deleted_at is null
        union all select a.id from education.assessment a where a.deleted_at is null
        union all select m.id from education.study_media m where m.deleted_at is null
        union all select n.id from workbench.notes n where n.deleted_at is null) c;

      execute 'reset role';
    exception when others then
      begin execute 'reset role'; exception when others then null; end;
      v_err := format('%s: %s', sqlstate, sqlerrm);
    end;

    if v_err is not null then
      raise exception 'dd137c3 UNMEASURED — the education library as % could not be probed (%).',
                      v_email, v_err;
    end if;

    select coalesce(array_agg(o), '{}') into v_leak
      from unnest(v_ids) o where o <> all (v_ceiling);
    if cardinality(v_leak) > 0 then
      raise exception 'dd137c3 WIDER — the library returned % row(s) % cannot read under RLS, e.g. %.',
                      cardinality(v_leak), v_email, v_leak[1];
    end if;

    if v_n_mine > v_n_orgs then
      raise exception 'dd137c3 NOT A NARROWING — mine counts % and orgs only %, for %.',
                      v_n_mine, v_n_orgs, v_email;
    end if;

    if v_n_orgs > 0 or v_n_mine > 0 then
      v_measured := v_measured + 1;
      v_notes := v_notes || format('  %s: orgs=%s mine=%s rls_ceiling=%s%s',
                                   v_email, v_n_orgs, v_n_mine, cardinality(v_ceiling), chr(10));
    end if;
  end loop;

  if v_measured = 0 then
    raise exception 'dd137c3: no principal saw a single library row — nothing was measured, so '
                    'nothing is proven. Pick principals who have education rows.';
  end if;

  raise notice E'dd137c3 PROVEN on % principal(s):\n%', v_measured, v_notes;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  raise;
end $$;
