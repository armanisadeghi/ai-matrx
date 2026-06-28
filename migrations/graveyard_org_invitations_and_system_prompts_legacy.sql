-- Move two legacy/duplicate clusters to target state (rows preserved, reversible):
--   organization_invitations (2 rows) — legacy org-invite store; canonical is
--     iam.invitations. The dependent "Invitees can view organization details"
--     policy on public.organizations is dropped FIRST so org reads do not
--     cascade-break on the now-missing table (same failure class as the
--     memberships RLS bug). The 2 invite rows live in graveyard pending a port to
--     iam.invitations.
--   system_prompts (24) + system_prompt_executions (FK child) — legacy prompt
--     store; canonical is agent.definition (same UUIDs already exist as agents).
-- Code that still reads these will throw — intended to-do signal; repoint AFTER.
drop policy if exists "Invitees can view organization details" on public.organizations;

do $$
declare t text;
begin
  foreach t in array array['system_prompt_executions','system_prompts','organization_invitations']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I set schema graveyard', t);
    end if;
  end loop;
end $$;
