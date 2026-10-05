-- RED before scopesfts1g_the_scope_switches_are_retired_with_their_instruments, GREEN after. Run inside begin; …; rollback.
do $g$
declare v jsonb; n int;
begin
  select count(*) into n from platform.cutover_seam where seam_key in ('agent_context', 'scopes_screens') and retired_at is null;
  if n > 0 then raise exception 'RED S1: % scope switches still listed on the switches screen', n; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'platform'::regnamespace
     and p.prosrc ~ 'context\.(scopes|scope_types|context_items|context_item_values|context_value_refs|scope_dataset_instances)\M'
     and p.proname ~ 'cutover';
  if n > 0 then raise exception 'RED S2: % switch functions still read the old scope rows', n; end if;
  -- the switch that stays answers as before (Cedar Ridge Physical Therapy)
  v := platform._cutover_seam_readiness('older_tables', (select id from iam.organizations where name = 'Cedar Ridge Physical Therapy' limit 1));
  if jsonb_typeof(v -> 'checks') <> 'array' or jsonb_array_length(v -> 'checks') = 0 then raise exception 'RED S3: the Data tables switch lost its checks: %', v; end if;
  v := platform._cutover_seam_readiness('scopes_screens', (select id from iam.organizations where name = 'Cedar Ridge Physical Therapy' limit 1));
  if v #>> '{checks,0,key}' <> 'known' then raise exception 'RED S4: a retired switch still measures: %', v; end if;
  raise notice 'GREEN: scope switches retired, Data tables switch answers';
end $g$;
