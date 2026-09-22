-- SIGNUP-DOOR — the dormant second signup door is closed loudly, and the live one is untouched.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Brightwater Dental Partners, a two-chair
-- family dental practice in Coeur d'Alene, Idaho, signs up for AI Matrx. Their office manager
-- creates the account; the platform must give her exactly ONE personal organization, through
-- exactly ONE provisioning path, and stamp exactly one users.profiles row with it. This suite
-- asserts nothing about her data — it asserts about the DOORS that would run at that moment.
--
-- WHY A DORMANT DOOR IS A DEFECT AND NOT A CURIOSITY. `public.handle_new_dm_user` is a signup
-- trigger function that creates a personal organization and writes users.profiles. It has been
-- attached to NO trigger since the 2026-08-22 project move restored four other triggers on
-- auth.users and deliberately not this one. Attached to nothing, it is invisible; re-attached
-- by anyone — a restore, a copy-paste, a schema diff tool — it becomes a SECOND provisioning
-- path running beside `_provision_new_user_personal_org`, inventing a second organization for
-- an account that already has one. `migrations/campaign/signupdoor_the_dormant_second_signup_door_is_closed_loudly.sql`
-- replaces its body with one that raises 23502 naming the live path.
--
-- RED BEFORE / GREEN AFTER. Run this before the migration and clause 2 raises; run it after and
-- every clause passes. It ends in ROLLBACK and leaves nothing behind.

\set suite 'signupdoor_green.sql'
\set requires 'function:public.handle_new_dm_user|function:public._provision_new_user_personal_org|function:public._provision_new_user_profile|relation:users.profiles'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  v_def text;
  v_attached text;
  v_sqlstate text;
  v_message text;
  v_live text;
  v_dormant text;
begin
  perform set_config('app.actor_system', 'campaign.signup_door_suite', true);

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_dm_user';

  -- ── 1. IT IS STILL THERE. Soft-retire, never delete: a dropped name comes back silently. ──
  if v_def is null then
    raise exception 'CLAUSE 1 FAILED: public.handle_new_dm_user is GONE. It was retired, not dropped — a name that no longer exists can be re-created by anyone with no warning at all.';
  end if;

  -- ── 2. THE CREATION SHAPE IS OUT OF THE BODY, AND THE SENTENCE IS IN IT. ──
  if v_def ~* 'ensure_personal_organization' or v_def ~* 'insert\s+into\s+users\.profiles' then
    raise exception 'CLAUSE 2 FAILED: public.handle_new_dm_user still CREATES a personal organization and writes users.profiles. This is the dormant second signup door, exactly as DEFAULT-ORG-4 left it.';
  end if;
  if v_def !~ '_provision_new_user_personal_org' or v_def !~ '_provision_new_user_profile' then
    raise exception 'CLAUSE 2 FAILED: the retirement body does not NAME the live signup path. A refusal that does not say what to do instead is a dead end.';
  end if;
  if v_def ~ 'personal-organization-creation:' then
    raise exception 'CLAUSE 2 FAILED: the body still carries its DEFAULT-ORG-4 creation declaration, so the no-default-organization census will keep printing this name as a creation site that creates nothing.';
  end if;

  -- ── 3. IT IS ATTACHED TO NOTHING, IN EVERY SCHEMA — NOT ONLY auth.users. ──
  select string_agg(t.tgname || ' on ' || n.nspname || '.' || c.relname, ', ')
    into v_attached
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
   where not t.tgisinternal
     and pn.nspname = 'public' and p.proname = 'handle_new_dm_user';
  if v_attached is not null then
    raise exception 'CLAUSE 3 FAILED: public.handle_new_dm_user IS attached — %. A retired door that something runs is not retired.', v_attached;
  end if;

  -- ── 4. RE-ATTACHING IT FAILS AT THE FIRST ROW, WITH THE SENTENCE. ──
  --    The proof is not that the body contains a `raise`; it is that a trigger over it stops a
  --    write. A scratch table inside this transaction stands in for auth.users.
  create temporary table signupdoor_probe (id uuid primary key default gen_random_uuid()) on commit drop;
  create trigger signupdoor_probe_t after insert on signupdoor_probe
    for each row execute function public.handle_new_dm_user();
  begin
    insert into signupdoor_probe default values;
    raise exception 'CLAUSE 4 FAILED: re-attaching public.handle_new_dm_user and inserting a row SUCCEEDED. The second signup door still runs.';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    if v_sqlstate <> '23502' then
      raise exception 'CLAUSE 4 FAILED: expected 23502 from the retired door, got % — %', v_sqlstate, v_message;
    end if;
    if v_message !~ '_provision_new_user_personal_org' or v_message !~ 'on_auth_user_created' then
      raise exception 'CLAUSE 4 FAILED: the refusal does not name the live signup path: %', v_message;
    end if;
  end;

  -- ── 5. THE LIVE SIGNUP PATH IS EXACTLY WHAT IT WAS, AND THIS FILE DID NOT TOUCH IT. ──
  select string_agg(t.tgname || '->' || pn.nspname || '.' || p.proname, ', ' order by t.tgname)
    into v_live
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
   where not t.tgisinternal and n.nspname = 'auth' and c.relname = 'users'
     and p.proname in ('_provision_new_user_personal_org', '_provision_new_user_profile');
  if v_live is distinct from 'on_auth_user_created->public._provision_new_user_personal_org, on_auth_user_created_profile->public._provision_new_user_profile' then
    raise exception 'CLAUSE 5 FAILED: the live signup path is not what this lane measured. Found: %', coalesce(v_live, '(nothing)');
  end if;

  -- ── 6. THERE IS NO THIRD ONE. THE CLASS, NOT THE INSTANCE. Every non-system schema, every
  --    trigger body in the catalogue: one that CALLS a personal-organization provisioner while
  --    NO trigger runs it is another dormant signup door, and it is named here, never counted.
  --    A retired body that merely NAMES the live path in its refusal sentence is not a call —
  --    public.create_personal_organization (DEFAULT-ORG-3) is exactly that, and the `(` is what
  --    tells them apart.
  select string_agg(pn.nspname || '.' || p.proname, ', ' order by p.proname)
    into v_dormant
    from pg_proc p
    join pg_namespace pn on pn.oid = p.pronamespace
   where p.prokind = 'f'
     and p.prorettype = 'trigger'::regtype
     and pn.nspname not in ('pg_catalog', 'information_schema', 'extensions', 'graphql', 'pgbouncer')
     and pg_get_functiondef(p.oid) ~* '(ensure_personal_organization|provision_signup_organization)\s*\('
     and not exists (
       select 1 from pg_trigger t where not t.tgisinternal and t.tgfoid = p.oid
     );
  if v_dormant is not null then
    raise exception 'CLAUSE 6 FAILED: dormant signup-shaped trigger body(s) attached to nothing: %. Close each one the way this lane closed handle_new_dm_user.', v_dormant;
  end if;

  raise notice 'signupdoor_green.sql — 6/6 clauses PASSED. The dormant second signup door refuses with 23502 naming on_auth_user_created and _provision_new_user_personal_org; the live path is untouched; no other signup-shaped trigger body is attached to nothing.';
end $$;

rollback;
