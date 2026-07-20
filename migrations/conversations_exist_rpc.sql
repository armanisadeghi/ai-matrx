-- conversations_exist_rpc.sql
--
-- Existence probe for conversations that is IMMUNE to RLS asymmetry.
--
-- WHY THIS EXISTS
-- `platform.associations` is readable AND deletable org-wide
-- (`iam.has_org_access(organization_id)`), but `chat.conversation` SELECT is
-- per-row (`created_by = auth.uid() OR iam.has_access(...,'viewer')`). So a
-- plain `select id from chat.conversation where id in (...)` returns zero rows
-- for TWO different reasons — the row is absent, or the caller may not read it
-- — and a client cannot tell them apart.
--
-- The phantom-edge sweeper (`pruneContainerPhantomConversations`) deletes edges
-- whose conversation "does not exist". Without this function, user B opening a
-- teammate's War Room reads A's edges (org-wide), fails to read A's private
-- conversations, concludes they are all phantom, and DELETES A's real chats —
-- permitted, because the delete is org-wide too. This function makes absence
-- mean absence.
--
-- Disclosure: returns only which of the caller-supplied ids exist. That is a
-- boolean oracle over UUIDs the caller already holds — no titles, no contents,
-- no ownership. `authenticated` only; `anon` is revoked.

create or replace function public.conversations_exist(p_ids uuid[])
returns table (id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select c.id
  from chat.conversation c
  where c.id = any(p_ids)
    and c.deleted_at is null
$$;

revoke all on function public.conversations_exist(uuid[]) from public, anon;
grant execute on function public.conversations_exist(uuid[]) to authenticated;
