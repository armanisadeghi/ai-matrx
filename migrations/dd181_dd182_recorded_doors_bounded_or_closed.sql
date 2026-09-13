-- dd181_dd182_recorded_doors_bounded_or_closed — THE LAST DOORS DD-172 RECORDED, NOW CLOSED OR BOUNDED
-- (DD-181 and DD-182. SECURITY. db-rules §0/§6d/§9.)
--
-- ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════════════════════════
-- DD-172 (B-66) gave every live RLS policy a migration of record. Three of the doors it recorded
-- it deliberately did NOT close, because closing them was outside that lane's remit, and B-64
-- reported two tables that answer real rows to the published anonymous key. This file reads each
-- one against the live database and its callers in all four repositories, and then closes or
-- bounds it. Nothing here is closed on a guess: each part states the caller census that decided it.
--
-- ═══ PART 1 — THREE UNBOUNDED ANONYMOUS INSERT DOORS, ALL THREE WITHOUT A WRITER ═══════════════
-- `communication.emails.form_insert` and `"Allow guest execution inserts"` on
-- `users.guest_executions` and `users.guest_execution_log` are PERMISSIVE INSERT policies with
-- `WITH CHECK (true)` and no rate, shape or column bound. Measured on this database 2026-09-13 as
-- the `anon` role: one arbitrary row inserted into `communication.emails` with attacker-chosen
-- sender/recipient/subject/body, and 1,000 rows in one statement. That is the whole abuse surface.
--
-- THE CENSUS OF THE REAL SIGNED-OUT WRITER, in matrx-frontend, aidream, matrx-extend, matrx-local:
--
--   communication.emails — NO writer, anywhere. The reason recorded in
--   `iam_bespoke_policies_of_record_dd172.sql` says "the public contact form posts here". It does
--   not. `app/api/contact/route.ts` writes `communication.contact_submissions`, through
--   `createAdminClient()` (the service role) on a server route, behind a 3-per-IP-per-hour rate
--   limit. `communication.emails` holds 10 rows, has no insert path in any repository, and
--   aidream's own migration 0240 calls it untouched, reserved for a future email feature. The door
--   was recorded from a plausible sentence that nobody checked against the code.
--
--   users.guest_executions / users.guest_execution_log — the real signed-out writer is
--   `public.record_guest_execution(...)`, a SECURITY DEFINER function owned by `postgres`, granted
--   EXECUTE to `anon`, which INSERTs into BOTH tables and is what
--   `lib/services/guest-limit-service.ts` calls from the browser (`supabase.rpc(...)`, never a
--   table insert). A definer function owned by the tables' owner does not consult their RLS at all,
--   so the guest flow never needed these policies. aidream writes the same tables through the ORM
--   as our own login role; matrx-frontend's admin routes write them as the service role.
--
-- So there is no bounded door to build here: the correct bound is zero. All three policies are
-- superseded and the `anon` role's write privileges on the three tables are revoked with them —
-- a grant kept beside a closed policy is the safe path standing next to the unsafe one.
--
-- ═══ PART 2 — A STAFF LANE GRANTED BY EMAIL SUFFIX, WHICH IS ALSO BREAKING THE TABLES ══════════
-- `users.guest_execution_log.admin_all_guest_logs` and its twin
-- `users.guest_executions.admin_all_guest_executions` are PERMISSIVE `FOR ALL` on
-- `is_platform_admin() OR EXISTS (SELECT 1 FROM auth.users WHERE users.id = auth.uid() AND
-- users.email LIKE '%@aimatrx.com')`. Identity by string match is wrong on its own terms — ten
-- identities on this database carry that suffix and NINE of them are not in `admin.admins`,
-- including `oauth-review@aimatrx.com` (an external reviewer account) and two disposable test
-- accounts — and `users.guest_executions` holds 120,000+ rows of `ip_address` and `fingerprint`,
-- which is exactly the data the 2026-08-25 leak was about.
--
-- 🚨 IT IS ALSO BREAKING BOTH TABLES TODAY. The policy reads `auth.users`, and the `authenticated`
-- role has no SELECT privilege on `auth.users`. A policy that raises cannot be short-circuited by
-- the OR beside it, so EVERY authenticated read of either table fails with
-- `42501 permission denied for table users` — proven under `admin@admin.com`, a real platform
-- admin, who sees the error today and 120,442 rows the moment these two policies are gone. The
-- lane that was supposed to widen staff access has been denying it to everyone, silently, for as
-- long as it has existed.
--
-- Superseded, not rewritten: `platform_admin_all` beside them already IS the roster lane
-- (`is_platform_admin()`), so identity comes from `admin.admins` by membership after this file.
--
-- ═══ PART 3 — THE "TWO ADMIN ROSTERS" ARE ONE ROSTER (recorded here, nothing to change) ════════
-- B-66 named `tool.executor`, `tool.mcp_config`, `tool.mcp_server` and `tool.surface_defaults`
-- carrying `ref_admin` = `is_platform_admin() OR is_admin()` as two rosters that can disagree.
-- They cannot. `public.is_admin()` reads `admin.admins`; `public.is_platform_admin()` reads
-- `public.current_user_is_admin`, which is `SELECT user_id, true AS is_admin, level FROM
-- admin.admins a` — a view over the SAME table whose `is_admin` column is the literal `true`. The
-- two predicates are the same set by construction, and measured so: 6 rows each way, zero
-- identities where the two disagree, over every row of `auth.users`. There was never a second
-- roster, only a second name for `admin.admins`.
-- The four `ref_admin` policies were themselves superseded earlier today by
-- `platform_base_contract_dd173_batch2_ui_and_tool_catalogs.sql`, so nothing remains to drop; this
-- file asserts that below so the finding closes on a measurement rather than on a story.
--
-- ═══ PART 4 — DD-182: THE TWO TABLES THAT ANSWER THE PUBLISHED ANON KEY ════════════════════════
--   public.catalog_entries — a REAL signed-out caller: the matrx-local desktop app fetches its
--   remote catalogs pre-login over PostgREST with the publishable key
--   (`matrx-local/app/services/catalogs/client.py`; contract in
--   common-docs/systems/clients/remote-catalogs/FEATURE.md), and MUST, because no account exists
--   yet. The read stays. What does not stay is the column surface: the same feature's OTHER public
--   path, aidream's unauthenticated `GET /api/catalogs/{app}`, publishes exactly fourteen columns
--   and strips `updated_by` in `aidream/services/catalogs/service.py` as "server bookkeeping, not
--   client data". The SQL path published it anyway — proven live over HTTPS with the publishable
--   key: 18 rows returning a platform admin's user uuid — and today's DD-173 base retrofit widened
--   that surface further by adding `created_by`, `organization_id`, `metadata`, `version` and
--   `visibility` to the table, all of which `select=*` hands to any anonymous caller.
--   So the anon read is bounded to the feature's own declared public contract by COLUMN privilege,
--   which is the only layer that can bound columns (RLS cannot) and which `iam.apply_rls` does not
--   touch (it issues no GRANT of any kind — verified in its source). matrx-local's client is moved
--   off `select=*` onto that same column list in this change.
--
--   tool.binding — NO signed-out caller. `cfg_select_via_definition` is `TO anon, authenticated`
--   and hands 630 rows to the publishable key today, but no client in any of the four repositories
--   reads `tool.binding` through supabase-js at all: aidream reads it server-side through the ORM,
--   and matrx-frontend's admin routes read `tool.definition`. The policy is superseded and
--   recreated byte-identical except for its role list, which becomes `authenticated` only — a pure
--   narrowing of the anonymous axis with no change for a signed-in caller.
--
-- ═══ WHAT THIS FILE DOES NOT DO ════════════════════════════════════════════════════════════════
-- The wider census this lane measured and did not act on: 176 relations on this database have a
-- SELECT-capable policy reaching `anon` AND an `anon` SELECT grant, and a name-pattern sweep of
-- their columns returns hundreds of `created_by` / `updated_by` / `user_id` / `email` /
-- `ip_address` hits. That is a campaign, not this brief, and it is reported rather than widened
-- into here. What this file adds is the guard for the two relations DD-182 names, so their column
-- surface cannot widen again without a person saying so.
set local lock_timeout = '4s';

-- ══════════════════════════════════════════════ PART 1 — THE THREE ANONYMOUS INSERT DOORS, CLOSED
do $$
declare
  v_before_emails integer;
  v_rpc_ok boolean;
begin
  -- The RED this closes, asserted rather than asserted-about: the policies are live and unbounded.
  if not exists (select 1 from pg_policy p
                  where p.polrelid = 'communication.emails'::regclass and p.polname = 'form_insert'
                    and pg_get_expr(p.polwithcheck, p.polrelid) = 'true') then
    raise exception
      'dd181: communication.emails.form_insert is not the unbounded WITH CHECK (true) policy this file was written against. Someone changed it. Nothing was dropped — re-read the table before running this.';
  end if;

  -- The real writer must exist BEFORE the guest doors go, or this file is an outage.
  select exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
     where n.nspname = 'public' and pr.proname = 'record_guest_execution'
       and pr.prosecdef
       and pr.proowner = 'postgres'::regrole
       and has_function_privilege('anon', pr.oid, 'EXECUTE')
  ) into v_rpc_ok;
  if not v_rpc_ok then
    raise exception
      'dd181: public.record_guest_execution is not a SECURITY DEFINER function owned by postgres with EXECUTE to anon. That function IS the signed-out guest writer; without it, dropping the guest INSERT policies would take the guest flow down. Nothing was dropped.';
  end if;

  select count(*) into v_before_emails from communication.emails;
  raise notice 'dd181: communication.emails holds % row(s) before this file; no repository inserts into it', v_before_emails;
end $$;

select iam.supersede_bespoke_policies(
  'communication', 'emails', array['form_insert'],
  'CLOSED (DD-181a). An unbounded PERMISSIVE INSERT to anon with WITH CHECK (true) and no caller: measured live, the anon role inserted an arbitrary row and then 1,000 rows in one statement. Its recorded reason said the public contact form posts here; the contact form writes communication.contact_submissions through the service role behind a per-IP rate limit (app/api/contact/route.ts), and no file in matrx-frontend, aidream, matrx-extend or matrx-local inserts into communication.emails at all. Staff keep the table through platform_admin_all; the service role keeps it through its own grant.');

select iam.supersede_bespoke_policies(
  'users', 'guest_executions', array['Allow guest execution inserts'],
  'CLOSED (DD-181a). An unbounded PERMISSIVE INSERT to PUBLIC with WITH CHECK (true). The real signed-out writer is public.record_guest_execution, a SECURITY DEFINER function owned by postgres with EXECUTE granted to anon, which the browser calls through supabase.rpc in lib/services/guest-limit-service.ts; a definer function owned by the table owner does not consult this table RLS, so the guest flow never used this policy and is unchanged by its removal. Nothing else writes the table as anon in any of the four repositories.');

select iam.supersede_bespoke_policies(
  'users', 'guest_execution_log', array['Allow guest execution inserts'],
  'CLOSED (DD-181a). The per-execution twin of the guest usage door, same unbounded shape and same verdict: public.record_guest_execution INSERTs this table too, as a SECURITY DEFINER function owned by postgres, so the signed-out guest flow keeps working without any anon INSERT policy here. No repository writes this table as anon.');

-- A grant left beside a closed policy is the safe path standing next to the unsafe one.
revoke select, insert, update, delete on communication.emails       from anon;
revoke         insert, update, delete on users.guest_executions     from anon;
revoke         insert, update, delete on users.guest_execution_log  from anon;

-- ════════════════════════════════════════ PART 2 — THE EMAIL-SUFFIX STAFF LANE, BY ROSTER INSTEAD
do $$
declare
  v_suffix integer; v_not_admin integer;
begin
  select count(*), count(*) filter (where a.user_id is null)
    into v_suffix, v_not_admin
    from auth.users u left join admin.admins a on a.user_id = u.id
   where u.email like '%@aimatrx.com';
  raise notice
    'dd181b: % identity(ies) carry the @aimatrx.com suffix, % of them are NOT in admin.admins — that gap is what the string match granted', v_suffix, v_not_admin;

  -- platform_admin_all must already be the roster lane, or this is a narrowing nobody can undo.
  if not exists (select 1 from pg_policy p
                  where p.polrelid = 'users.guest_executions'::regclass and p.polname = 'platform_admin_all')
     or not exists (select 1 from pg_policy p
                  where p.polrelid = 'users.guest_execution_log'::regclass and p.polname = 'platform_admin_all')
  then
    raise exception
      'dd181b: platform_admin_all is missing from one of the guest tables, so superseding the email-suffix lane would leave staff with no door at all. Nothing was dropped.';
  end if;
end $$;

select iam.supersede_bespoke_policies(
  'users', 'guest_executions', array['admin_all_guest_executions'],
  'CLOSED (DD-181b). Identity by string match: FOR ALL on is_platform_admin() OR an auth.users email LIKE %@aimatrx.com. Nine of the ten suffixed identities on this database are not in admin.admins, including an external oauth-review account, and this table holds 120,000+ ip_address and fingerprint rows. It was also breaking the table: authenticated has no SELECT on auth.users, so this policy raised 42501 for every signed-in reader including real platform admins, proven under admin@admin.com before and after. platform_admin_all beside it grants exactly admin.admins membership, which is identity by roster.');

select iam.supersede_bespoke_policies(
  'users', 'guest_execution_log', array['admin_all_guest_logs'],
  'CLOSED (DD-181b). The recorded twin of the email-suffix staff lane, identical predicate and identical two defects: it grants FOR ALL by an email string rather than by admin.admins membership, and it reads auth.users, which authenticated cannot select, so it denied the whole table to every signed-in identity rather than widening it. Superseding both twins together is the point: closing one and recording the other would be a safe path beside an unsafe one.');

-- ═══════════════════════════════════ PART 3 — THE TWO ROSTERS ARE ONE ROSTER (assert, change none)
do $$
declare
  v_disagree integer; v_left integer;
begin
  select count(*) into v_disagree
    from auth.users u
   where (exists (select 1 from admin.admins a where a.user_id = u.id))
      <> (exists (select 1 from public.current_user_is_admin c where c.user_id = u.id and c.is_admin is true));
  if v_disagree <> 0 then
    raise exception
      'dd181c: % identity(ies) are admitted by one of is_admin()/is_platform_admin() and not the other, so they are genuinely two rosters and the finding needs a decision, not this assertion.', v_disagree;
  end if;

  select count(*) into v_left from pg_policy p
    where p.polname = 'ref_admin'
      and p.polrelid in ('tool.executor'::regclass, 'tool.mcp_config'::regclass,
                         'tool.mcp_server'::regclass, 'tool.surface_defaults'::regclass);
  if v_left <> 0 then
    raise exception
      'dd181c: % ref_admin policy(ies) are still live on the tool catalogs. DD-173 batch 2 superseded them earlier today; if they are back, something recreated them and that is the finding.', v_left;
  end if;

  raise notice
    'dd181c: public.current_user_is_admin is a view over admin.admins, the two predicates disagree on zero identities, and all four ref_admin policies are already superseded — one roster, nothing to fold';
end $$;

-- ════════════════════════ PART 4a — DD-182: catalog_entries KEEPS ITS ANON READ, BOUNDED BY COLUMN
do $$
declare
  v_leaked integer;
begin
  if not exists (select 1 from pg_policy p
                  where p.polrelid = 'public.catalog_entries'::regclass
                    and p.polcmd in ('r','*') and p.polpermissive
                    and (p.polroles = '{0}' or 'anon'::regrole = any (p.polroles))) then
    raise exception
      'dd182: public.catalog_entries has no anon-reaching SELECT policy, so the matrx-local desktop app cannot be loading its catalogs pre-login the way this file says it does. Re-read the table before bounding its columns.';
  end if;
  select count(*) into v_leaked from public.catalog_entries where updated_by is not null;
  raise notice 'dd182: % catalog_entries row(s) carry an updated_by uuid that the anon key can read today', v_leaked;
end $$;

-- The surface becomes exactly what the feature's OTHER public path publishes
-- (aidream/services/catalogs/service.py::_row_to_dict). `app`, `kind` and `key` are in the list
-- because PostgREST filters and orders on them and a filter needs the column privilege too.
revoke select on public.catalog_entries from anon;
grant select (
  id, app, kind, key, schema_version, payload,
  artifact_url, artifact_sha256, artifact_size_bytes, min_app_version,
  is_active, sort_order, notes, updated_at
) on public.catalog_entries to anon;

-- ════════════════════════════════ PART 4b — DD-182: tool.binding loses its anonymous axis, only it
do $$
declare
  v_qual text;
begin
  select pg_get_expr(p.polqual, p.polrelid) into v_qual
    from pg_policy p
   where p.polrelid = 'tool.binding'::regclass and p.polname = 'cfg_select_via_definition';
  if v_qual is null then
    raise exception
      'dd182: tool.binding.cfg_select_via_definition is gone. This file recreates it for authenticated from its own live bytes; with the policy already missing there is nothing to narrow and re-creating it from a stale copy would be inventing a door.';
  end if;
  if not exists (select 1 from pg_policy p
                  where p.polrelid = 'tool.binding'::regclass and p.polname = 'cfg_select_via_definition'
                    and 'anon'::regrole = any (p.polroles)) then
    raise notice 'dd182: cfg_select_via_definition no longer names anon — nothing to narrow';
    return;
  end if;

  perform iam.supersede_bespoke_policies(
    'tool', 'binding', array['cfg_select_via_definition'],
    'NARROWED (DD-182). Recreated in the same statement, byte-identical except that its role list loses anon. The policy handed 630 rows to the published publishable key, and no client in matrx-frontend, aidream, matrx-extend or matrx-local reads tool.binding through supabase-js at all: aidream reads it server-side through the ORM as our own role, and the admin routes read tool.definition. Signed-in access is unchanged.');

  execute format(
    'create policy cfg_select_via_definition on tool.binding for select to authenticated using (%s)', v_qual);
end $$;

revoke select, insert, update, delete on tool.binding from anon;

-- ═══════════════════════════════════════════════════ THE AFTER, MEASURED, NOT ASSUMED
do $$
declare
  v_open integer;
  v_cols text;
begin
  select count(*) into v_open
    from pg_policy p
   where p.polrelid in ('communication.emails'::regclass, 'users.guest_executions'::regclass,
                        'users.guest_execution_log'::regclass)
     and p.polcmd in ('a','*') and p.polpermissive
     and (p.polroles = '{0}' or 'anon'::regrole = any (p.polroles))
     and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid)) = 'true';
  if v_open <> 0 then
    raise exception 'dd181a: % unbounded anon write policy(ies) still stand on the three tables after this file', v_open;
  end if;

  if exists (select 1 from pg_policy p
              where p.polrelid in ('users.guest_executions'::regclass, 'users.guest_execution_log'::regclass)
                and pg_get_expr(p.polqual, p.polrelid) like '%@aimatrx.com%') then
    raise exception 'dd181b: an email-suffix predicate still stands on a guest table after this file';
  end if;

  select string_agg(a.attname, ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.catalog_entries'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT');
  raise notice 'dd182: the anon column surface of public.catalog_entries is now: %', v_cols;
  if has_column_privilege('anon', 'public.catalog_entries'::regclass, 'updated_by', 'SELECT')
     or has_column_privilege('anon', 'public.catalog_entries'::regclass, 'created_by', 'SELECT')
     or has_column_privilege('anon', 'public.catalog_entries'::regclass, 'organization_id', 'SELECT') then
    raise exception 'dd182: anon can still read an identity column of public.catalog_entries after this file';
  end if;

  if exists (select 1 from pg_policy p
              where p.polrelid = 'tool.binding'::regclass
                and (p.polroles = '{0}' or 'anon'::regrole = any (p.polroles))) then
    raise exception 'dd182: tool.binding still carries a policy naming anon after this file';
  end if;

  raise notice 'dd181/dd182: three anon write doors closed, two email-suffix staff lanes closed, one roster asserted, two anon read surfaces bounded';
end $$;
