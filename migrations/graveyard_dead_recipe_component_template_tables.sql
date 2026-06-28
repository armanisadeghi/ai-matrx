-- Move DB to target state: retire the dead recipe / applet-field-builder / template
-- system tables lingering in public (peers data_broker / message_broker /
-- broker_values / data_input_component / registered_function / registered_node are
-- already in graveyard). Code that still imports these throws type/app errors —
-- the intended to-do signal; references get repointed AFTER. SET SCHEMA preserves
-- every row and is reversible. Idempotent: only moves tables still in public.
do $$
declare t text;
begin
  foreach t in array array['recipe','compiled_recipe','component_groups','field_components','message_template']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I set schema graveyard', t);
    end if;
  end loop;
end $$;
