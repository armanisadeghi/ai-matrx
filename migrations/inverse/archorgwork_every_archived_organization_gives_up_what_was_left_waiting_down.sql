-- INVERSE of migrations/campaign/archorgwork_every_archived_organization_gives_up_what_was_left_waiting.sql
-- (lane ARCHIVED-ORG-WORK). Gives back exactly what the repair took, without restoring any
-- organization: every row listed by an OPEN history.migration_log event tagged
-- inverse.repair = 'archorgwork' that still carries the repair's own marks goes back as it was,
-- and the event is stamped undone. Run BEFORE the trigger file's inverse.

set lock_timeout = '30s';
set statement_timeout = '300s';

do $undo$
declare
  m record;
  x jsonb;
begin
  for m in
    select * from history.migration_log l
     where l.target_kind = 'organization' and l.verb = 'archive' and l.undone_at is null
       and l.inverse ->> 'repair' = 'archorgwork'
  loop
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   m.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive of organization', true);
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,approvals}', '[]'::jsonb)) loop
      update custom.record r
         set data = (r.data - 'decided_at' - 'withdrawn_by' - 'withdrawn_reason' - 'withdrawn_with' - 'outcome')
                    || '{"state":"pending"}'::jsonb
       where r.organization_id = m.organization_id and r.id = (x ->> 0)::uuid
         and r.data ->> 'withdrawn_with' = 'organization' and r.data ->> 'state' = 'withdrawn';
    end loop;
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,assignments}', '[]'::jsonb)) loop
      update custom.record r
         set data = r.data || jsonb_build_object('assignee', x ->> 1)
       where r.organization_id = m.organization_id and r.id = (x ->> 0)::uuid
         and nullif(r.data ->> 'assignee', '') is null;
    end loop;
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,sign_requests}', '[]'::jsonb)) loop
      update custom.record r
         set data = r.data - 'invalidated_at' - 'invalidation_reason' - 'invalidated_by' - 'invalidated_with'
       where r.organization_id = m.organization_id and r.id = (x ->> 0)::uuid
         and r.data ->> 'invalidated_with' = 'organization';
    end loop;
    update history.migration_log l set undone_at = now()
     where l.organization_id = m.organization_id and l.id = m.id;
  end loop;
end
$undo$;
