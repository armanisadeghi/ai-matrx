-- cx_message_base_retrofit.sql
-- Applied 2026-06-24 (Wave 3 base-retrofit; child-of-conversation template).
--
-- ADDITIVE. cx_message lacked org/actor/updated_at/version entirely. org_id is
-- DENORMALIZED from the parent conversation (keeps the hot message-read path off a
-- join-based RLS). created_by = the conversation's owning user. No existing triggers.
-- _version_capture deferred (17.7k churny rows). RLS flip + any drops are separate steps.
-- Idempotent (backfill guarded on organization_id IS NULL).

alter table public.cx_message
  add column if not exists organization_id uuid,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version integer not null default 1;

update public.cx_message m
   set organization_id = c.organization_id,
       created_by      = c.user_id,
       updated_at      = m.created_at
  from public.cx_conversation c
 where c.id = m.conversation_id
   and m.organization_id is null;

drop trigger if exists _touch_row on public.cx_message;
drop trigger if exists _stamp_actor on public.cx_message;
create trigger _touch_row  before insert or update on public.cx_message
  for each row execute function platform._touch_row();
create trigger _stamp_actor before insert or update on public.cx_message
  for each row execute function platform._stamp_actor();

do $$
declare n_null_org int; n_no_creator int;
begin
  select count(*) into n_null_org   from public.cx_message where organization_id is null;
  select count(*) into n_no_creator from public.cx_message where created_by is null;
  if n_null_org   > 0 then raise exception 'cx_message: % null-org rows remain', n_null_org; end if;
  if n_no_creator > 0 then raise exception 'cx_message: % rows missing created_by', n_no_creator; end if;
  raise notice 'cx_message base retrofit OK';
end $$;
