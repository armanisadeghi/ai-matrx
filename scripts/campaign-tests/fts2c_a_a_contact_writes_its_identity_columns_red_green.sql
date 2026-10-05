-- RED before the file (writable_columns = []), GREEN after (the nine identity columns).
do $$ declare n int; begin
  select coalesce(jsonb_array_length(value #> '{party,writable_columns}'),0) into n
    from platform.feature_knob where feature='table_api' and key='standard_tables';
  if n <> 9 then raise exception 'RED: party lists % writable columns', n; end if;
  raise notice 'GREEN: party lists 9 writable columns';
end $$;
