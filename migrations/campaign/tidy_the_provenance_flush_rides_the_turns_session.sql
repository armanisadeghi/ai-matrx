-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- TIDY 3 — THE PROVENANCE FLUSH STOPS OPENING A SESSION OF ITS OWN.
--
-- CONTEXT-PERF measured the context assembly at ELEVEN database round trips and wrote:
-- *"The flush costs its own session (three round trips) because the table refuses the
-- person's role by design. A server lane that already holds an owner-role connection for
-- the turn would pay nothing; today the context assembly does not have one."*
--
-- It does not need one. `custom.merge_field_provenance` revokes ALL from `anon`,
-- `authenticated` and `service_role` on purpose — it is a server-lane log, not a door — so
-- a write inside the person's `SET LOCAL ROLE authenticated` session is refused, and the
-- flush answered that by opening a SECOND session at the end of every turn: a connection
-- reset, a BEGIN, the combined SET, the insert and a COMMIT, ~0.35 s of the measured
-- 1.57 s. This function is the owner-role door the flush was missing. The turn's existing
-- session calls it ONCE and the whole second session goes away.
--
-- NOTHING IS WIDENED, and this is the part to check rather than assume.
--   * It is not client-callable: `authenticated` cannot reach schema `custom` at all, and
--     the DD-223 declaration below says `server_only` in a sentence.
--   * The organization is a PARAMETER, never read off a row, so a provenance row can still
--     never choose its own tenancy.
--   * The VALUE is still absent from every row. The triple (record, field, version) is what
--     reproduces it through the read door under the asking reader's own level — DYN-22's
--     whole design, unchanged.
--   * `created_by` is now stamped from the JWT claims of the person whose turn it was,
--     which is STRICTER than before: the old separate session had no person in it at all.
--
-- INVERSE: migrations/inverse/tidy_the_provenance_flush_rides_the_turns_session_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function custom.provenance_write(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_turn_id text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_written integer := 0;
begin
  if p_organization_id is null then
    raise exception 'custom.provenance_write: which organization''s turn?'
      using errcode = '22004',
            hint = 'A provenance row never chooses its own tenancy. The caller holds the request''s organization; pass it.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'custom.provenance_write: the rows must be a JSON array, and % is not one.', coalesce(jsonb_typeof(p_rows), 'null')
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  insert into custom.merge_field_provenance
    (organization_id, conversation_id, turn_id,
     merge_field_key, merge_field_id, declared_source, actual_source, outcome, freshness,
     record_id, field_id, value_version, rule_id, rule_version, override_by, tier,
     rendered, absent_reason, candidates, resolved_at)
  select
    p_organization_id,
    p_conversation_id,
    nullif(p_turn_id, ''),
    r ->> 'merge_field_key',
    nullif(r ->> 'merge_field_id', '')::uuid,
    r ->> 'declared_source',
    r ->> 'actual_source',
    r ->> 'outcome',
    coalesce(nullif(r ->> 'freshness', ''), 'live'),
    nullif(r ->> 'record_id', '')::uuid,
    nullif(r ->> 'field_id', '')::uuid,
    nullif(r ->> 'value_version', '')::integer,
    nullif(r ->> 'rule_id', '')::uuid,
    nullif(r ->> 'rule_version', '')::integer,
    r ->> 'override_by',
    coalesce(nullif(r ->> 'tier', ''), 'direct'),
    r ->> 'rendered',
    r ->> 'absent_reason',
    coalesce(r -> 'candidates', '[]'::jsonb),
    -- `resolved_at` arrives as the ISO STRING the panel serialises, which is why the old
    -- flush had to parse it in Python before asyncpg would bind it. Cast here instead: the
    -- caller sends the row it already built, once, and nothing reshapes it on the way.
    coalesce(nullif(r ->> 'resolved_at', '')::timestamptz, now())
  from jsonb_array_elements(p_rows) r;

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'provenance_write', 'p_organization_id uuid, p_conversation_id uuid, p_turn_id text, p_rows jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is the tenancy of every row written and is never NULL — the function refuses a NULL by name. It is the request''s organization, held by the server lane that just resolved the values under this person''s own session; it is not checked against the caller because the caller is that lane, not a browser.',
   'tidy_the_provenance_flush_rides_the_turns_session.sql',
   'server_only: called by matrx_records.merge.sink.flush_turn at the end of a context assembly. custom.merge_field_provenance revokes ALL from anon, authenticated and service_role on purpose - it is a log, not a door - and DYN-24 reads it through the panel that explains a value, never through this write.',
   false, false)
on conflict do nothing;

comment on function custom.provenance_write(uuid, uuid, text, jsonb) is
  'DYN-22''s durable write, as ONE owner-role call the person''s own turn session can make. '
  'Before this the flush opened a second RLS session at the end of every turn purely to '
  'escape SET LOCAL ROLE authenticated, which cost the assembly three of its eleven round '
  'trips. The VALUE is never written: the triple (record_id, field_id, value_version) is '
  'what reproduces it through the read door under the asking reader''s own level.';

revoke all on function custom.provenance_write(uuid, uuid, text, jsonb) from public, anon, authenticated;
