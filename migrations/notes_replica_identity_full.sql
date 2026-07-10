-- Realtime + RLS for shared notes: without FULL replica identity, postgres_changes
-- cannot evaluate SELECT policies that check non-PK columns (permissions / shares),
-- so sharees never receive UPDATE events. Owned-note `created_by=` filters also
-- hide shared rows. Pair with FE subscription that relies on RLS (no created_by
-- filter). Idempotent.
do $$
begin
  -- Already FULL → no-op
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workbench'
      and c.relname = 'notes'
      and c.relreplident = 'f'
  ) then
    return;
  end if;

  alter table workbench.notes replica identity full;
end $$;
