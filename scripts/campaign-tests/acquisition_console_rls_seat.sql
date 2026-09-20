-- THE ACQUISITION CONSOLE — RLS SEAT TEST.
--
-- The console (/acquisition) reads FIVE registers straight from the browser with the
-- signed-in person's own token. Its whole promise is "this is what THIS workspace has",
-- so the promise is only true if a seat outside the workspace reads nothing from it.
-- This proves that with real seats against the real database.
--
-- RUN IT (read-only; it takes no locks, writes nothing, and rolls back):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_MATRIX_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/acquisition_console_rls_seat.sql
--
-- It can also be run through the Supabase MCP as one statement batch — that is how it
-- was first run, 2026-09-19.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep sees it, it writes
-- nothing and it ROLLS BACK. It signs nobody in and reads no credential: it sets
-- `request.jwt.claims` to a bare `sub`, which is exactly what RLS reads.
--
-- WHAT MAKES IT FAIL — the production changes, named:
--   · drop the organization filter from any of the console's four org-keyed reads
--     while widening that table's RLS  → PART 2's four refusals
--   · widen `media.source_library`'s policy past `iam.my_orgs()`  → PART 2 (a)
--   · widen `platform.acquisition_block`'s policy               → PART 2 (b)
--   · let a Rulebook's Sources reach a seat that cannot reach the Rulebook
--                                                                → PART 3
--   · break org membership so a real member reads nothing        → PART 1
--
-- THE SEATS (no passwords, no sign-in, no secrets):
--   member      f0146c96-e02e-420b-a99f-92774da0566c — role `member` of AI Matrx.
--               DELIBERATELY NOT admin@admin.com: a platform admin's policies short-
--               circuit to `is_platform_admin()`, so testing with one proves nothing
--               about the fence an ordinary member stands behind.
--   non-member  4060701e-706a-4c76-b3ca-0bbc69fa5a14 — test@test.com, not in AI Matrx.

\set ON_ERROR_STOP on

begin;

do $seat$
declare
  v_org      constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';  -- AI Matrx
  v_member   constant text := '4cf62e4e-2679-484f-b652-034e697418df';
  v_outsider constant text := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_libs     integer;
  v_blocks   integer;
  v_handoffs integer;
  v_conns    integer;
  v_sources  integer;
  v_leaked   integer;
begin
  -- ── PART 1: a member of the workspace reads it — IN LANES. ──────────────
  --
  -- The positive control, and the lane proof in one. Without it, PART 2's zeros
  -- could mean "the database is empty" rather than "the fence held".
  --
  -- 🚨 `media.source_library.visibility` is the platform's four-lane enum, and in
  -- the live database 32 of AI Matrx's 33 Libraries are `personal`. So a member
  -- who did not add them reads ONE. That is correct and it is exactly why the
  -- console's first table carries a lane column: two people in one workspace get
  -- two different numbers, and the screen has to say why rather than print one
  -- word over both.
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_member),
    true
  );

  select count(*) into v_libs from media.source_library
   where organization_id = v_org and deleted_at is null;
  select count(*) into v_blocks from platform.acquisition_block
   where organization_id = v_org and deleted_at is null;
  select count(*) into v_sources from platform.masterwork_source
   where organization_id = v_org and deleted_at is null;

  if v_libs = 0 or v_blocks = 0 or v_sources = 0 then
    raise exception
      'PART 1 (a) FAILED: a member of AI Matrx reads libraries=%, blocks=%, rulebook sources=% — a zero here means the seat lost access, not that the fence works',
      v_libs, v_blocks, v_sources;
  end if;

  -- Not one Library this member reads may be somebody else's `personal` lane.
  select count(*) into v_leaked from media.source_library
   where organization_id = v_org and deleted_at is null
     and visibility = 'personal' and created_by <> v_member::uuid;
  if v_leaked <> 0 then
    raise exception
      'PART 1 (b) FAILED: this member reads % Libraries sitting in ANOTHER person''s personal lane',
      v_leaked;
  end if;

  raise notice 'PART 1 ok — the member reads libraries=%, blocks=%, rulebook sources=%, and 0 of anyone else''s personal lane',
    v_libs, v_blocks, v_sources;

  -- ── PART 2: a seat outside the workspace reads NOTHING of it. ───────────
  perform set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_outsider),
    true
  );

  select count(*) into v_libs from media.source_library
   where organization_id = v_org and deleted_at is null;
  select count(*) into v_blocks from platform.acquisition_block
   where organization_id = v_org and deleted_at is null;
  select count(*) into v_handoffs from media.capture_handoff
   where organization_id = v_org and deleted_at is null;
  select count(*) into v_conns from users.integration_connections
   where organization_id = v_org and deleted_at is null;

  if v_libs <> 0 then
    raise exception 'PART 2 (a) FAILED: an outsider reads % of this workspace''s Libraries', v_libs;
  end if;
  if v_blocks <> 0 then
    raise exception 'PART 2 (b) FAILED: an outsider reads % of this workspace''s blocks', v_blocks;
  end if;
  if v_handoffs <> 0 then
    raise exception 'PART 2 (c) FAILED: an outsider reads % of this workspace''s hand-offs', v_handoffs;
  end if;
  if v_conns <> 0 then
    raise exception 'PART 2 (d) FAILED: an outsider reads % of this workspace''s connections', v_conns;
  end if;
  raise notice 'PART 2 ok — the outsider reads 0 Libraries, 0 blocks, 0 hand-offs, 0 connections';

  -- ── PART 3: the fifth register, whose fence is a different shape. ───────
  --
  -- `platform.masterwork_source`'s RLS is keyed on REACHING THE RULEBOOK, not on the
  -- organization stamped on the row. That is deliberate — a Rulebook shared with you
  -- carries its Sources with it — so the honest invariant is not "an outsider reads
  -- zero" but "every row an outsider reads is explained by a Rulebook they can reach".
  --
  -- A row stamped to THIS workspace whose Rulebook is ALSO in this workspace must never
  -- reach an outsider. Anything that does is a real leak and this refuses it by count.
  select count(*) into v_leaked
    from platform.masterwork_source ms
    join platform.rulebook rb on rb.id = ms.rulebook_id
   where ms.organization_id = v_org
     and ms.deleted_at is null
     and rb.organization_id = v_org;

  if v_leaked <> 0 then
    raise exception
      'PART 3 FAILED: an outsider reads % Sources belonging to a Rulebook that is itself inside this workspace',
      v_leaked;
  end if;

  select count(*) into v_sources from platform.masterwork_source
   where organization_id = v_org and deleted_at is null;
  raise notice
    'PART 3 ok — the outsider reads 0 Sources of this workspace''s own Rulebooks (% reachable rows are stamped here but hang off Rulebooks in another organization; see the console''s STATE.md)',
    v_sources;

  raise notice 'ALL PARTS PASSED — the Acquisition Console is a per-workspace screen.';
end;
$seat$;

rollback;
