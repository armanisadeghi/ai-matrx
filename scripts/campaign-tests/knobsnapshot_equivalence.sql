-- lane: KNOB-SNAPSHOT  (2026-10-08)
-- Run by pasting into the Supabase MCP / psql as the owner. Rolls back; the DO block always raises
-- its report, and PASS/FAIL is the first word of it.
--
-- Clause 1 (equivalence): for each person x organization, the map platform.knob_snapshot returns is
--   IDENTICAL to the one-call-per-knob oracle (platform.knob_resolve for every register row).
-- Clause 2 (the delta is the whole difference): platform.knob_defaults ++ platform.knob_snapshot_delta.overrides
--   is the same map again, and every delta key really differs from its default.
-- Clause 3 (etag): the delta's etag answers "unchanged" and drops the payload; the defaults version does too.
-- Clause 4 (size and time): delta under 20 kB and the snapshot under 100 ms server-side per case.
-- Proven failing first: with the pre-change body (per-knob loop) clause 4 fails (2.5-3.9 s).
do $$
declare
  c record; snap jsonb; oracle jsonb; delta jsonb; defs jsonb; again jsonb;
  t0 timestamptz; ms numeric; out text := ''; bad int := 0;
begin
  for c in select * from (values
      ('admin',    '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid),
      ('test',     '4060701e-706a-4c76-b3ca-0bbc69fa5a14',       '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'),
      ('member-a', '4cf62e4e-2679-484f-b652-034e697418df',       '3e790542-fdaf-40b2-8bf3-658bf94fe67f'),
      ('admin-b',  '87a6e699-3622-4869-8843-d0867456c0dd',       '5dc930e9-bd65-44a1-8369-af773f6e1a5b'),
      ('no-org',   '87a6e699-3622-4869-8843-d0867456c0dd',       null)) v(n, u, o) loop
    perform set_config('request.jwt.claims', json_build_object('sub', c.u, 'role', 'authenticated')::text, true);
    t0 := clock_timestamp();
    snap := platform.knob_snapshot(c.o, c.u, null);
    ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    select coalesce(jsonb_object_agg(k.feature || '.' || k.key, platform.knob_resolve_uncached(k.feature, k.key, c.o, c.u, null)), '{}')
      into oracle from platform.feature_knob k;
    defs  := platform.knob_defaults(null);
    t0 := clock_timestamp();
    delta := platform.knob_snapshot_delta(c.o, c.u, null, null);
    ms := greatest(ms, round(extract(epoch from clock_timestamp() - t0) * 1000));
    again := platform.knob_snapshot_delta(c.o, c.u, null, delta ->> 'etag');
    if (snap -> 'resolved') is distinct from oracle then bad := bad + 1; out := out || '  FAIL snapshot != oracle for ' || c.n || E'\n'; end if;
    if ((defs -> 'defaults') || (delta -> 'overrides')) is distinct from oracle then bad := bad + 1; out := out || '  FAIL defaults++delta != oracle for ' || c.n || E'\n'; end if;
    if exists (select 1 from jsonb_each(delta -> 'overrides') e where e.value = (defs -> 'defaults') -> e.key) then bad := bad + 1; out := out || '  FAIL delta carries a default for ' || c.n || E'\n'; end if;
    if (again ->> 'unchanged') is distinct from 'true' or again ? 'overrides' then bad := bad + 1; out := out || '  FAIL etag not honoured for ' || c.n || E'\n'; end if;
    if length(delta::text) >= 20000 then bad := bad + 1; out := out || '  FAIL delta >= 20 kB for ' || c.n || E'\n'; end if;
    if ms >= 100 then bad := bad + 1; out := out || '  FAIL ' || ms || ' ms for ' || c.n || E'\n'; end if;
    out := out || c.n || ': keys=' || (select count(*) from jsonb_object_keys(oracle)) || ' delta_keys=' || (select count(*) from jsonb_object_keys(delta -> 'overrides'))
           || ' delta_bytes=' || length(delta::text) || ' ms=' || ms || ' md5=' || md5((snap -> 'resolved')::text) || E'\n';
  end loop;
  if (platform.knob_defaults((platform.knob_defaults(null)) ->> 'version') ->> 'unchanged') is distinct from 'true' then
    bad := bad + 1; out := out || E'  FAIL defaults version not honoured\n';
  end if;
  raise exception '%', case when bad = 0 then 'PASS' else 'FAIL ' || bad end || E'\n' || out;
end $$;
