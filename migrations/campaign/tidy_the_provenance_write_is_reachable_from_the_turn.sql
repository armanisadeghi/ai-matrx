-- chair-step: this file GRANTs EXECUTE on one door to `authenticated` and UPDATEs that door's own row in platform.client_callable_door. Both are refused by the additive allow-list by name, and both are the point of the file: the door was shipped an hour ago revoked from the only role that ever calls it, so the provenance flush fails with `permission denied for function provenance_write` on every turn. No DROP, no REVOKE on a live door, no data movement; one function body replaced under its `-- based-on:` hash, one grant, one registry row corrected.
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: custom.provenance_write(uuid, uuid, text, jsonb) b87ceaccb373ee7ff26253809a4e41eb85cf9e159efe4a8b74457a2b44f432ae
--
-- TIDY 3b — THE DEFECT MY OWN MEASUREMENT CAUGHT, AN HOUR AFTER I SHIPPED IT.
--
-- `tidy_the_provenance_flush_rides_the_turns_session.sql` made `custom.provenance_write`
-- SECURITY DEFINER so the flush could stop opening a second RLS session — and then REVOKED
-- EXECUTE from `authenticated`, which is the role the turn's session actually runs as. A
-- SECURITY DEFINER function escapes what the definer's role cannot do; it does NOT escape
-- needing permission to be CALLED. So the flush answered
-- `InsufficientPrivilegeError: permission denied for function provenance_write` on its
-- first real invocation, and I found that by MEASURING the thing rather than by reasoning
-- about it. The revoke was cargo-culted from the table's own `revoke all`, which is right
-- for the TABLE and wrong for the door.
--
-- THE FIX IS A REAL DOOR, NOT A LOOSER GRANT. `custom.provenance_write` now asks
-- `custom.assert_client_may_reach(p_organization_id, …)` on its first line — the one
-- ladder every door in this schema asks — so a person may record the provenance of a turn
-- in an organization they belong to, and nobody else may. That is STRICTLY BETTER than
-- what it replaced: the old second session wrote with nobody's identity at all.
--
-- What does NOT change: no value is ever stored (the triple reproduces it through the read
-- door under whoever asks later), the organization is a parameter that is refused when
-- NULL, and the TABLE stays unreadable by every client role — `custom` is a closed schema
-- (`platform.schema_client_exposure`), so this grant is reachable by a server lane holding
-- the person's session and by nothing a browser can address.
--
-- INVERSE: migrations/inverse/tidy_the_provenance_write_is_reachable_from_the_turn_down.sql

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
  -- THE ONE LADDER, ASKED BY NAME IN THIS BODY. A reader of this door must see the
  -- question without following a call: may the person whose session this is write into
  -- this organization at all.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.provenance_write');
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
    coalesce(nullif(r ->> 'resolved_at', '')::timestamptz, now())
  from jsonb_array_elements(p_rows) r;

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

update platform.client_callable_door
   set non_client_lane = null,
       signed_in_callers = true,
       anonymous_callers = false,
       reason = 'p_organization_id is the tenancy of every row written, is refused when NULL by name, and is checked against the caller by custom.assert_client_may_reach on the function''s first line: a person may record the provenance of a turn in an organization they belong to and in no other. No row carries a value, so nothing readable crosses this door in either direction.',
       declared_by = 'tidy_the_provenance_write_is_reachable_from_the_turn.sql'
 where schema_name = 'custom' and function_name = 'provenance_write';

grant execute on function custom.provenance_write(uuid, uuid, text, jsonb) to authenticated;
