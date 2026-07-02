-- Two tables lost their `supabase_realtime` publication membership somewhere
-- in the 2026 schema-reorg (SET SCHEMA does not carry publication membership
-- across the move). Their FE Realtime subscriptions were pointed at the
-- correct schema/table but silently received zero events because the table
-- was never registered in the publication under any schema. Idempotent via
-- pg_publication_tables guard (ALTER PUBLICATION ... ADD TABLE has no IF NOT
-- EXISTS form).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'users' and tablename = 'user_memory'
  ) then
    alter publication supabase_realtime add table users.user_memory;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'iam' and tablename = 'permissions'
  ) then
    alter publication supabase_realtime add table iam.permissions;
  end if;
end $$;
