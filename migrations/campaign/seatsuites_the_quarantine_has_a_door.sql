-- chair-step: it GRANTS EXECUTE on one new function to `authenticated`, which is the shape the
--   runner's allow-list refuses by name. The function is NEW, reads one table, writes nothing,
--   and decides three times before it answers: the store switch, the organization wall, and
--   then every row against custom.has_visibility at ADMIN on the Table the submission is for.
--   Nothing is dropped, nothing is revoked, no row of any feature is deleted or rewritten. The
--   inverse is migrations/inverse/seatsuites_the_quarantine_has_a_door_down.sql.
-- additive: yes
-- guard: custom/system_enabled
--
-- SEAT-SUITES — WHAT A STRANGER SENT US: THE QUARANTINE GETS A DOOR.
--
-- FOUND BY RUNNING `scripts/campaign-tests/w4_anon_green.sql` FROM THE SEAT A SIGNED-IN PERSON
-- HAS. The anonymous lane is deliberately one-way: `custom.anon_write`, `custom.anon_token_verify`
-- and `custom.anon_inbound_land` are declared server_only, because the server is what holds the
-- token and reads the request Origin header. That is right, and it is not the whole story. A
-- submission lands QUARANTINED — it is not a record, no Rule has cleared it — and until now
-- NOTHING a person can call could read it:
--   · `custom.anon_submission` carries no client grant and schema `custom` is closed;
--   · the only submission verbs with a grant are `custom.anon_capture` (write) and the form and
--     token admin verbs;
--   · `custom.anon_clear`'s own door row says "the human triage screen calls the review verb,
--     not this one" — and there was no review verb, and no way to LIST what is waiting.
-- So the suite's every "and this is what landed" clause could only be made by reading the table
-- as the role that owns it, which is exactly the seat that proves nothing.
--
-- TRIAGE IS AN ADMIN ACT, and the door says so on every row: the payload is a stranger's raw
-- input, kept with the headers it arrived under. A viewer of the Table is not shown it; an
-- admin of the Table is. A row whose Table the caller may not open is not returned at all.
--
-- WHAT MAKES IT FAIL (rule 3): drop the function, which is exactly what
-- migrations/inverse/seatsuites_the_quarantine_has_a_door_down.sql does — and
-- `scripts/campaign-tests/w4_anon_green.sql` PART 2, PART 6 and PART 7 go red naming it.

create or replace function custom.anon_submissions(
  p_organization_id uuid,
  p_table_id        uuid default null,
  p_state           text default null,
  p_limit           integer default 100,
  p_offset          integer default 0)
returns table(id uuid, form_id uuid, inbound_id uuid, table_id uuid, source text,
              state text, payload jsonb, raw_payload jsonb, client_key text,
              record_id uuid, remote_origin text, rejection_reason text,
              created_at timestamp with time zone, cleared_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_submissions');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.anon_submissions');
  if p_table_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.anon_submissions',
                                          'admin'::public.permission_level, 'record');
  end if;
  v_me := custom.query_principal();

  return query
    select s.id, s.form_id, s.inbound_id, s.table_id, s.source, s.state, s.payload,
           s.raw_payload, s.client_key, s.record_id, s.remote_origin, s.rejection_reason,
           s.created_at, s.cleared_at
      from custom.anon_submission s
     where s.organization_id = p_organization_id
       and s.deleted_at is null
       and (p_table_id is null or s.table_id = p_table_id)
       and (p_state is null or s.state = p_state)
       -- EVERY ROW ON THE ONE LADDER, at ADMIN. What a stranger sent is not a value of the
       -- Table yet and it is not shown to everybody who may read the Table's records.
       and (v_me is null
            or custom.has_visibility(v_me, 'record', s.table_id, 'admin'::public.permission_level))
     order by s.created_at desc, s.id desc
     limit greatest(least(coalesce(p_limit, 100), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers,
   anonymous_callers, identity_argtypes)
values
  ('custom','anon_submissions',
   'p_organization_id uuid, p_table_id uuid, p_state text, p_limit integer, p_offset integer',
   'migrations/campaign/seatsuites_the_quarantine_has_a_door.sql (lane SEAT-SUITES)',
   'SEAT-SUITES / DOOR-17 / DOOR-19 / DOOR-21: what a stranger sent us, waiting in quarantine — the read the human triage screen needs and never had. p_organization_id is decided against the caller by custom.assert_client_may_reach after custom.assert_store_door; p_table_id, when given, is decided at ADMIN by custom.assert_client_may_open, and when it is null every row returned is filtered by custom.has_visibility at admin on the Table the submission is for, so a caller is shown only the quarantines they may triage. Triage is an admin act because the payload is a stranger''s raw input kept with the headers it arrived under; a viewer of the Table is not shown it. Writes nothing. The anonymous WRITER still has no account and no grant: custom.anon_write, custom.anon_token_verify and custom.anon_inbound_land stay server_only and this row is signed-in only.',
   true, false, array[2950,2950,25,23,23]::oid[])
on conflict do nothing;

grant execute on function custom.anon_submissions(uuid, uuid, text, integer, integer) to authenticated;
