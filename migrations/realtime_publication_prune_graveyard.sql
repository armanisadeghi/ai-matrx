-- Retired tables cannot have runtime postgres_changes consumers. Keeping them
-- in the publication still feeds any future archival writes into WAL decoding.
do $$
declare
  retired_table text;
begin
  foreach retired_table in array array[
    'broker_value',
    'cld_file_permissions',
    'conversation_documents',
    'files_share_links',
    'note_shares'
  ] loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'graveyard'
        and tablename = retired_table
    ) then
      execute format(
        'alter publication supabase_realtime drop table graveyard.%I',
        retired_table
      );
    end if;
  end loop;
end;
$$;
