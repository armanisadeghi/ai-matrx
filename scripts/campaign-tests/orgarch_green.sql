-- LANE ORG-ARCHIVE — THE GREEN SUITE. An organization is ARCHIVED, never deleted: archiving
-- closes it for everyone at once, every row inside it stays exactly where it is, it is hidden by
-- default and revealable in one click, and restoring it gives all of it back with no window and
-- no expiry.
-- On the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/orgarch_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/orgarch_red.sql`, which runs the real bytes of both
-- inverse files and asserts that every clause below is gone.
--
-- THE SEAT. Every asserted clause runs as `authenticated`, the role PostgREST gives a signed-in
-- person, through doors that person reaches. PART 0 proves the seat is held. The fixture steps
-- that no client door covers step out and say so, and assert nothing while they are out.
--
-- THE USE CASE (no fake test data). Cascade Grounds Management is a commercial landscaping and
-- snow-removal contractor in Portland, Oregon: crew schedules, seasonal maintenance contracts,
-- and a winter on-call roster. Sam Whitfield (admin@admin.com) owns the workspace; Dana Reyes
-- (test@test.com) is a crew lead and an ordinary member. The organization is retired at the end
-- of the season, and reopened the following spring — which is exactly the shape the owner ruled:
-- an archive, not a delete.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1  drop `iam.organization_archive` / `iam.organization_restore` → there is no way to close or
--      reopen an organization and the Danger Zone is back to a delete nothing can perform.
--   2  put `iam.my_orgs()` back to its pre-lane body → an archived organization's members keep
--      every row of it, so "archived" means nothing anywhere in the platform.
--   3  point `org_select_policy` at `iam.my_orgs()` again → an archived organization vanishes
--      from its own owner, so nobody can ever reveal or restore it: an archive that is a black
--      hole is a delete with extra steps.
--   4  drop the owner check or the typed-name check from either door → a member closes somebody
--      else's organization, or a stray call does it with no dialog drawn.
--   5  drop the archive test from `public.list_user_organizations` / `get_user_organizations` →
--      the default stops hiding archived organizations, which is THE ARCHIVED-ITEMS LAW gone.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART: the archived organization is
-- paired throughout with a live sister organization that must keep behaving exactly as before,
-- and every refusal for Dana is paired with the one thing she CAN do.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com (Sam)
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com (Dana)
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();   -- Cascade Grounds Management — archived, then restored
  v_live    uuid := gen_random_uuid();   -- Cascade Grounds Snow Division — must never change
  v_name    text;
  v_live_nm text;
  v_res     jsonb;
  v_state   jsonb;
  v_caught  text;
  v_n       integer;
  v_pers    uuid;
  v_pers_nm text;
  v_boss    text := current_user;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'orgarch_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/orgarch_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_name    := 'Cascade Grounds Management ' || substr(v_org::text, 1, 8);
  v_live_nm := 'Cascade Grounds Snow Division ' || substr(v_live::text, 1, 8);

  -- FIXTURE, as the connected role. Cleanup finds a test organization by this settings tag, never
  -- by its name (OWNER LAW 2026-09-21).
  insert into iam.organizations (id, name, slug, abbreviation, created_by, is_personal, settings) values
    (v_org,  v_name,    'cascade-grounds-'      || substr(v_org::text, 1, 8),  'CGM', c_admin, false,
     jsonb_build_object('campaign_test', 'ORG-ARCHIVE')),
    (v_live, v_live_nm, 'cascade-grounds-snow-' || substr(v_live::text, 1, 8), 'CGS', c_admin, false,
     jsonb_build_object('campaign_test', 'ORG-ARCHIVE'));
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,  'organization', v_org,  c_admin, 'owner',  'active'),
    (v_org,  'organization', v_org,  c_dana,  'member', 'active'),
    (v_live, 'organization', v_live, c_admin, 'owner',  'active'),
    (v_live, 'organization', v_live, c_dana,  'member', 'active');

  -- ── PART 0 — take the seat and PROVE it ─────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'iam.organizations'::regclass),
                 'member') then
    raise exception '0: this seat owns iam.organizations, so every wall would open on its first line';
  end if;

  -- ── PART 1a — before anything, both organizations are live and visible ──────────────────────
  select count(*) into v_n from public.list_user_organizations(c_admin, 'active')
   where id in (v_org, v_live);
  if v_n <> 2 then
    raise exception '1a: the two fixture organizations should both be active, saw %', v_n;
  end if;
  select count(*) into v_n from iam.my_orgs() m(id) where m.id in (v_org, v_live);
  if v_n <> 2 then
    raise exception '1a: both should be inside my_orgs() before the archive, saw %', v_n;
  end if;

  -- ── PART 1b — a member cannot archive it, and the one thing she CAN do still works ──────────
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    v_res := iam.organization_archive(v_org, v_name, 'end of season');
    raise exception '1b: Dana is only a member and archived the organization anyway';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%' || v_name || '%' then
      raise exception '1b: the refusal did not name the organization — "%"', v_caught;
    end if;
  end;
  select count(*) into v_n from public.list_user_organizations(c_dana, 'active') where id = v_org;
  if v_n <> 1 then
    raise exception '1b: Dana is a member and should still see it in her own list, saw %', v_n;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── PART 1c — the owner must type the name back, character for character ────────────────────
  begin
    v_res := iam.organization_archive(v_org, v_name || ' ', 'end of season');
    raise exception '1c: a near-miss name archived the organization';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like 'Type the organization%' then
      raise exception '1c: the refusal was not the typed-name sentence — "%"', v_caught;
    end if;
  end;

  -- ── PART 2a — archive it, and read the sentence back ────────────────────────────────────────
  v_res := iam.organization_archive(v_org, v_name, 'Season closed — crews move to the snow roster');
  if not (v_res ->> 'archived')::boolean or not (v_res ->> 'changed')::boolean then
    raise exception '2a: the archive door did not report a change — %', v_res;
  end if;
  if v_res ->> 'sentence' not like '%nothing was deleted%' then
    raise exception '2a: the sentence does not say nothing was deleted — "%"', v_res ->> 'sentence';
  end if;

  -- ── PART 2b — THE ACCESS ANSWER closed, and only for that organization ──────────────────────
  select count(*) into v_n from iam.my_orgs() m(id) where m.id = v_org;
  if v_n <> 0 then
    raise exception '2b: an archived organization is still inside my_orgs(), so nothing closed';
  end if;
  select count(*) into v_n from iam.my_orgs() m(id) where m.id = v_live;
  if v_n <> 1 then
    raise exception '2b: archiving one organization took the sister organization down with it';
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from iam.my_orgs() m(id) where m.id = v_org;
  if v_n <> 0 then
    raise exception '2b: Dana still holds the archived organization, so members did not lose access';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── PART 2c — hidden by default, one parameter away, and the row itself still readable ──────
  select count(*) into v_n from public.list_user_organizations(c_admin, 'active') where id = v_org;
  if v_n <> 0 then
    raise exception '2c: the default list still shows an archived organization';
  end if;
  select count(*) into v_n from public.list_user_organizations(c_admin, 'archived') where id = v_org;
  if v_n <> 1 then
    raise exception '2c: the archive filter does not reveal it';
  end if;
  select count(*) into v_n from public.list_user_organizations(c_admin, 'all') where id = v_org;
  if v_n <> 1 then
    raise exception '2c: "all" does not include it';
  end if;
  select count(*) into v_n from public.list_user_organizations(c_admin, 'active') where id = v_live;
  if v_n <> 1 then
    raise exception '2c: the live sister organization fell out of the default list';
  end if;
  select count(*) into v_n from iam.organizations where id = v_org;
  if v_n <> 1 then
    raise exception '2c: the owner can no longer read the archived organization row itself, so '
                    'nothing could ever reveal or restore it';
  end if;

  -- ── PART 2d — the archive filter refuses a fourth value rather than guessing ────────────────
  begin
    perform public.list_user_organizations(c_admin, 'deleted');
    raise exception '2d: the reader accepted an archive filter value that does not exist';
  exception when invalid_parameter_value then null;
  end;

  -- ── PART 2e — an ordinary person may not list somebody else's organizations ────────────────
  -- (Sam is a platform admin and may, which is the paired second input with the other answer.)
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform public.list_user_organizations(c_admin, 'all');
    raise exception '2e: Dana listed Sam''s organizations';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_n from public.list_user_organizations(c_dana, 'all') where id = v_live;
  if v_n <> 1 then
    raise exception '2e: Dana cannot list her OWN organizations either, saw %', v_n;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  select count(*) into v_n from public.list_user_organizations(c_dana, 'all') where id = v_org;
  if v_n <> 1 then
    raise exception '2e: a platform admin cannot read a member''s list, saw %', v_n;
  end if;

  -- ── PART 3a — the banner says who, when and why, and who may put it back ───────────────────
  v_state := iam.organization_archive_state(v_org);
  if not (v_state ->> 'known')::boolean or not (v_state ->> 'archived')::boolean then
    raise exception '3a: the state door does not know its own archived organization — %', v_state;
  end if;
  if not (v_state ->> 'may_restore')::boolean then
    raise exception '3a: the owner is told he may not restore his own organization';
  end if;
  if v_state ->> 'reason' <> 'Season closed — crews move to the snow roster' then
    raise exception '3a: the reason did not come back — "%"', v_state ->> 'reason';
  end if;
  if v_state ->> 'sentence' not like '%Nothing was deleted%' then
    raise exception '3a: the banner sentence does not say nothing was deleted — "%"',
      v_state ->> 'sentence';
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_state := iam.organization_archive_state(v_org);
  if not (v_state ->> 'known')::boolean then
    raise exception '3a: a member of the archived organization is told it does not exist';
  end if;
  if (v_state ->> 'may_restore')::boolean then
    raise exception '3a: a plain member is offered the Restore action';
  end if;

  -- ── PART 3b — and she cannot restore it ────────────────────────────────────────────────────
  begin
    v_res := iam.organization_restore(v_org, v_name);
    raise exception '3b: a member restored an organization she does not own';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── PART 4a — restore, with the name typed back, and everything comes back ─────────────────
  begin
    v_res := iam.organization_restore(v_org, 'Cascade Grounds');
    raise exception '4a: a near-miss name restored the organization';
  exception when check_violation then null;
  end;
  v_res := iam.organization_restore(v_org, v_name);
  if (v_res ->> 'archived')::boolean or not (v_res ->> 'changed')::boolean then
    raise exception '4a: the restore door did not report a change — %', v_res;
  end if;
  select count(*) into v_n from iam.my_orgs() m(id) where m.id = v_org;
  if v_n <> 1 then
    raise exception '4a: the organization is restored but is not back inside my_orgs()';
  end if;
  select count(*) into v_n from public.list_user_organizations(c_admin, 'active') where id = v_org;
  if v_n <> 1 then
    raise exception '4a: the restored organization is not back in the default list';
  end if;
  select count(*) into v_n from public.list_user_organizations(c_admin, 'archived') where id = v_org;
  if v_n <> 0 then
    raise exception '4a: the restored organization is still in the archived list';
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from iam.my_orgs() m(id) where m.id = v_org;
  if v_n <> 1 then
    raise exception '4a: the member did not get her access back';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── PART 4b — both acts are in the audit trail, readable after the archive ─────────────────
  select count(*) into v_n from iam.org_admin_audit
   where organization_id = v_org and action in ('organization.archived', 'organization.restored');
  if v_n <> 2 then
    raise exception '4b: the archive and the restore are not both audited, saw % row(s)', v_n;
  end if;

  -- ── PART 5 — a personal workspace is never archivable ──────────────────────────────────────
  -- `organizations_one_personal_per_creator` means a personal organization cannot be minted for a
  -- fixture, so this asks the door about Sam's REAL personal workspace. It raises before it
  -- writes anything, so the real row is never touched — and the whole suite rolls back anyway.
  perform set_config('role', v_boss, true);          -- no client door reads another org's name
  select id, name into v_pers, v_pers_nm
    from iam.organizations where created_by = c_admin and is_personal limit 1;
  perform set_config('role', 'authenticated', true);
  if v_pers is null then
    raise exception '5: admin@admin.com has no personal workspace to ask about';
  end if;
  begin
    v_res := iam.organization_archive(v_pers, v_pers_nm, null);
    raise exception '5: a personal workspace was archived';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%personal workspace%' then
      raise exception '5: the refusal was not about the personal workspace — "%"', v_caught;
    end if;
  end;
  if (select archived_at from iam.organizations where id = v_pers) is not null then
    raise exception '5: the refused call archived the personal workspace anyway';
  end if;

  raise notice 'ALL PARTS PASSED (1a both live, 1b a member cannot, 1c the typed name, 2a the '
               'archive, 2b access closed for everyone, 2c hidden by default and one parameter '
               'away, 2d no fourth filter value, 2e nobody lists another person, 3a the banner, '
               '3b a member cannot restore, 4a the restore, 4b the audit, 5 the personal '
               'workspace) — every clause from the seat `authenticated`.';
end
$t$;

rollback;
