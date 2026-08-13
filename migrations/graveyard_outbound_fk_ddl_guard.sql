-- graveyard_outbound_fk_ddl_guard.sql
-- Permanent containment for the class exposed by education_flashcard_*:
-- a table moved after the one-time FK sweep could retain constraints into live
-- schemas because the general DDL guard deliberately skips graveyard objects.

create or replace function platform._graveyard_outbound_fk_guard()
returns event_trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare cmd record; v_violation text;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
  loop
    if cmd.in_extension or cmd.command_tag not in ('CREATE TABLE', 'ALTER TABLE') then
      continue;
    end if;

    select string_agg(
      format('%s (%I) -> %s', fk.conrelid::regclass, fk.conname, fk.confrelid::regclass),
      ', ' order by fk.conname
    )
    into v_violation
    from pg_constraint fk
    join pg_class source_rel on source_rel.oid = fk.conrelid
    join pg_namespace source_ns on source_ns.oid = source_rel.relnamespace
    join pg_class target_rel on target_rel.oid = fk.confrelid
    join pg_namespace target_ns on target_ns.oid = target_rel.relnamespace
    where fk.contype = 'f'
      and source_ns.nspname = 'graveyard'
      and target_ns.nspname <> 'graveyard';

    if v_violation is not null then
      raise exception 'graveyard boundary: retired relation retains outbound FK(s) into live schemas: %', v_violation
        using hint = 'Drop or deliberately migrate every outbound live FK before moving a relation into graveyard. Retired data may not constrain live objects.',
              errcode = 'check_violation';
    end if;
  end loop;
end;
$function$;

drop event trigger if exists graveyard_outbound_fk_guard;
create event trigger graveyard_outbound_fk_guard
on ddl_command_end
when tag in ('CREATE TABLE', 'ALTER TABLE')
execute function platform._graveyard_outbound_fk_guard();

comment on function platform._graveyard_outbound_fk_guard() is
  'Rejects any CREATE/ALTER that leaves a graveyard relation with an FK into a live schema.';
