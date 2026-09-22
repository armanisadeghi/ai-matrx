-- WALK 20 DEFECT C — A DUPLICATE NAME NEVER MINTS A SECOND RULEBOOK, AND NEVER REACHES A
-- BROWSER AS A 409. From admin@admin.com's real seat, against the real door.
--
-- THE WALK (common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/cold-walk-20):
-- typing a Rulebook name that already existed made `rulebook_create` answer 409, the client
-- retried, the retry answered 200, and a third identically-named Rulebook appeared in the list
-- with nothing said on screen. The 409 was a SLUG collision — `rulebook_slug_live_unique` is a
-- global unique index and the client slugifies the name a person typed.
--
-- THIS SUITE IS THE FAILING-THEN-PASSING HALF ON THE SERVER SIDE. Run it BEFORE applying
-- migrations/walk20_rulebook_create_is_idempotent_and_owns_its_slug.sql and clause 1 raises
-- `unique_violation` out of the door exactly as the walk saw; run it after and all four pass:
--
--   psql -v ON_ERROR_STOP=1 -f scripts/campaign-tests/walk20_a_duplicate_name_never_mints_a_second_rulebook.sql
--
-- THE USE CASE THE FIXTURE DATA COMES FROM, unchanged from the walk that found the defect: a
-- landscape irrigation contractor deciding whether a dry or flooding zone on an HOA property
-- needs a controller reprogram, a valve and solenoid repair, a drip retrofit or a mainline
-- replacement — and never putting a replacement number on a proposal before somebody has put a
-- pressure gauge on the point of connection.
--
-- It writes nothing: the outermost transaction rolls back.

\set ON_ERROR_STOP on

\set suite 'walk20_a_duplicate_name_never_mints_a_second_rulebook.sql'
\set requires 'function:public.rulebook_create'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $suite$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  c_name   constant text := 'Zone failure verdict — HOA irrigation';
  v_org    uuid;
  v_first  jsonb;
  v_second jsonb;
  v_third  jsonb;
  v_token  uuid := gen_random_uuid();
  v_slug   text := 'zone-failure-verdict-hoa-irrigation-' || substr(md5(random()::text), 1, 8);
  v_passes int := 0;
begin
  select iam.default_organization_id(c_admin) into v_org;
  if v_org is null then
    raise exception 'setup: admin@admin.com has no default organization, so this suite has no real tenant to write in';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() <> c_admin then
    raise exception 'setup: this suite did not take admin@admin.com''s seat (user %, uid %)',
      current_user, auth.uid();
  end if;

  -- ═══ 1. THE SAME NAME TWICE IS NOT A REFUSAL ════════════════════════════════
  -- The exact reproduction from the walk: the same name, so the client's slugify produces the
  -- same slug, sent twice. BEFORE the migration the second call raises unique_violation — which
  -- is the 409 the browser saw. AFTER it, the door finds its own free address and answers.
  v_first := public.rulebook_create(
    p_organization_id => v_org,
    p_name => c_name,
    p_slug => v_slug,
    p_description => 'How I decide whether a dry or flooding zone needs a controller reprogram, a valve and solenoid repair, a drip retrofit, or a mainline replacement.',
    p_sections => jsonb_build_object('G', jsonb_build_object('label', 'General')),
    p_visibility => 'internal');

  begin
    v_second := public.rulebook_create(
      p_organization_id => v_org,
      p_name => c_name,
      p_slug => v_slug,
      p_description => 'The second book of the same name — a real thing an Expert does, and never an error she has to solve.',
      p_sections => jsonb_build_object('G', jsonb_build_object('label', 'General')),
      p_visibility => 'internal');
  exception when unique_violation then
    raise exception '1: the door still hands a duplicate NAME back as 23505 — this is the 409 the browser saw and silently retried (walk 20, defect C)';
  end;

  if v_second->>'id' = v_first->>'id' then
    raise exception '1: two separate intents collapsed into one Rulebook — they carried no client_token and must be two';
  end if;
  if v_second->>'name' <> c_name then
    raise exception '1: the door rewrote the Expert''s own name to "%" — names are never auto-suffixed', v_second->>'name';
  end if;
  if v_second->>'slug' = v_first->>'slug' then
    raise exception '1: two live Rulebooks came back holding one slug, which the unique index cannot allow';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 1  a second Rulebook of the same name is CREATED, with the name untouched and a slug the door found for itself (% then %)',
    v_first->>'slug', v_second->>'slug';

  -- ═══ 2. THE DOOR SAYS THE NAME WAS ALREADY IN USE ═══════════════════════════
  -- Not a refusal — the one fact the screen needs in order to say a sentence instead of nothing.
  if not jsonb_exists(v_first, 'name_already_in_use')
     or not jsonb_exists(v_second, 'name_already_in_use') then
    raise exception '2: the door answers nothing about the name, so the screen has nothing to say (walk 20: "nothing is said")';
  end if;
  if (v_second->>'name_already_in_use')::boolean is not true then
    raise exception '2: the SECOND create of an identical name reported name_already_in_use = %', v_second->>'name_already_in_use';
  end if;
  if (v_first->>'created')::boolean is not true then
    raise exception '2: the first create did not report itself as a create';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 2  the door reports name_already_in_use, so the silence the walk measured is impossible';

  -- ═══ 3. TWO CREATES WITH ONE TOKEN YIELD ONE ROW ════════════════════════════
  -- The walk's accidental duplicate: pressing Start a second time. One intent, one Rulebook.
  v_second := public.rulebook_create(
    p_organization_id => v_org,
    p_name => c_name || ' (pressed twice)',
    p_slug => v_slug || '-twice',
    p_sections => jsonb_build_object('G', jsonb_build_object('label', 'General')),
    p_visibility => 'internal',
    p_metadata => jsonb_build_object('client_token', v_token));
  v_third := public.rulebook_create(
    p_organization_id => v_org,
    p_name => c_name || ' (pressed twice)',
    p_slug => v_slug || '-twice',
    p_sections => jsonb_build_object('G', jsonb_build_object('label', 'General')),
    p_visibility => 'internal',
    p_metadata => jsonb_build_object('client_token', v_token));

  if v_third->>'id' <> v_second->>'id' then
    raise exception '3: a second press carrying the SAME token minted a second Rulebook (% then %)',
      v_second->>'id', v_third->>'id';
  end if;
  if (v_third->>'created')::boolean is not false then
    raise exception '3: the replay reported itself as a create';
  end if;
  if (select count(*) from platform.rulebook r
       where r.created_by = c_admin and r.client_token = v_token) <> 1 then
    raise exception '3: more than one row carries the token';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 3  two creates carrying one token yield ONE row, and the second answers with the first''s Rulebook';

  -- ═══ 4. THE TOKEN IS TRANSPORT, NOT METADATA ════════════════════════════════
  -- It must not survive into the column six features share, and the declared client key set must
  -- be exactly what it was.
  if jsonb_exists(v_second->'metadata', 'client_token') then
    raise exception '4: client_token was stored into metadata, which six features share';
  end if;
  if 'client_token' = any (public._rulebook_client_metadata_keys()) then
    raise exception '4: client_token was added to the declared client metadata keys';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 4  the token is stripped before the write — metadata is untouched and the declared client key set is unchanged';

  reset role;
  raise notice '';
  raise notice '  %/4 assertions green', v_passes;
  if v_passes <> 4 then
    raise exception 'suite: % assertions passed, not 4', v_passes;
  end if;
end;
$suite$;

rollback;
