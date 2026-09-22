-- chair-step: it GRANTS EXECUTE on one new function to `authenticated`, which is the shape the
--   runner's allow-list refuses by name. The function is new, reads one table, writes nothing,
--   and decides twice before it answers: the organization wall, then every row against
--   custom.has_visibility on its own target. It exists because `history.migration_log` — where
--   every Migration verb writes what it did and why — had no client door at all, so T12's "in
--   History with the reason", T5's "History shows the merge" and custom.migrate_undo's own
--   p_log_id were unreachable from any seat. Nothing is dropped, nothing is revoked, no row of
--   any feature is deleted or rewritten. The inverse is
--   migrations/inverse/storet_history_has_a_door_down.sql.
-- additive: yes
-- guard: custom/system_enabled
--
-- STORE-T — WHAT HAPPENED TO THIS RECORD, AND WHY: THE MIGRATION LOG GETS A DOOR.
--
-- `history.migration_log` is where every one of the ten Migration verbs writes what it did, in
-- a sentence, with the inverse that undoes it. Schema `history` is closed to clients and has no
-- door, so NOTHING a person or an agent can call has ever been able to read it. Three
-- consequences, all of them measured:
--   · T12 says "abc is in History with the reason". The reason IS written — by
--     `custom._field_type_converts_values` — and no screen could ever show it.
--   · lane STORE-REL left T5's last clause red for exactly this: "History shows the merge…
--     The word lives in history.migration_log, which no client reads. A door over that log
--     closes it."
--   · `custom.migrate_undo` takes a `p_log_id` that a caller had no way to obtain. The sixth
--     pass noticed the symptom — "the undo door asks for p_log_id and the merge hands back
--     migration_id, so a caller has to guess that they are the same thing" — and the deeper
--     fact is that there was no way to LIST them at all.
--
-- THE DOOR DECIDES, twice: the organization wall, and then every row is filtered by whether the
-- caller may open the thing it is about. `inverse` is NOT returned — it is the store's own
-- undo instruction, not a person's business, and `custom.migrate_undo` is how it is used.

create or replace function custom.migrations(
  p_organization_id uuid,
  p_target_id       uuid default null,
  p_limit           integer default 100)
returns table(id uuid, verb text, target_kind text, target_id uuid,
              note text, applied_at timestamp with time zone, applied_by uuid,
              undone_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrations');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrations');
  if p_target_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_target_id, 'custom.migrations',
                                          'viewer'::public.permission_level, 'record');
  end if;
  v_me := custom.query_principal();

  return query
    select m.id, m.verb, m.target_kind, m.target_id, m.note, m.applied_at, m.applied_by, m.undone_at
      from history.migration_log m
     where m.organization_id = p_organization_id
       and (p_target_id is null or m.target_id = p_target_id)
       -- EVERY ROW ON THE ONE LADDER. A migration is about a thing; if you may not open the
       -- thing you are not told what happened to it. A row whose target is already gone is
       -- shown to a member of the organization, because there is nothing left to decide and
       -- hiding the record of a deletion is how a history stops being one.
       and (v_me is null
            or custom.has_visibility(v_me, 'record', m.target_id, 'viewer'::public.permission_level)
            or not exists (select 1 from custom.record r
                            where r.organization_id = p_organization_id and r.id = m.target_id))
     order by m.applied_at desc, m.id desc
     limit greatest(least(coalesce(p_limit, 100), 500), 1);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
values
  ('custom','migrations','p_organization_id uuid, p_target_id uuid, p_limit integer',
   'migrations/campaign/storet_history_has_a_door.sql (lane STORE-T)',
   'STORE-T / T12 / T5: what happened to this record and why — the sentence every Migration verb writes. p_organization_id is decided against the caller by custom.assert_client_may_reach; p_target_id, when given, is decided at viewer by custom.assert_client_may_open, and when it is null every row returned is filtered by custom.has_visibility on its own target, so a caller is told only about things they may open (plus rows whose target no longer exists, because hiding the record of a deletion is how a history stops being one). The `inverse` column is never returned — it is the store''s undo instruction, and custom.migrate_undo is how it is used. Writes nothing.',
   true, array[2950,2950,23]::oid[])
on conflict do nothing;

grant execute on function custom.migrations(uuid, uuid, integer) to authenticated;
