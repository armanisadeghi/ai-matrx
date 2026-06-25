-- cx_conversation_base_retrofit.sql
-- Applied 2026-06-24 during the DB changeover (Wave 3 base-retrofit, first table / template).
--
-- ADDITIVE / non-breaking. Adds standard actor + version columns, backfills them,
-- and consolidates onto the shared _touch_row / _stamp_actor triggers.
--
-- DEFERRED to separate, gated steps:
--   * org-first RLS flip (needs apply_rls patched for organization_id + a consumer
--     audit incl. both Next.js admin dashboards + the Python admin)
--   * history capture (_version_capture held — cx_conversation is churny until the
--     runtime-state columns move out, per the extreme-churn opt-out)
--   * DROP project_id / task_id / is_favorite (after the consumer audit + PITR;
--     drop the _mirror_proj / _mirror_task triggers first)
-- org backfill source = each user's personal org (coverage verified 100%, 0 orphans).
-- Idempotent (add column if not exists, drop trigger if exists, backfill only nulls).

alter table public.cx_conversation
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists version integer not null default 1;

drop trigger if exists cx_conversation_updated on public.cx_conversation;
drop trigger if exists _touch_row on public.cx_conversation;
drop trigger if exists _stamp_actor on public.cx_conversation;

update public.cx_conversation set created_by = user_id where created_by is null;
update public.cx_conversation c
   set organization_id = (
     select o.id from public.organizations o
     where o.is_personal and o.created_by = c.user_id
     order by o.created_at limit 1)
 where organization_id is null;

create trigger _touch_row  before insert or update on public.cx_conversation
  for each row execute function platform._touch_row();
create trigger _stamp_actor before insert or update on public.cx_conversation
  for each row execute function platform._stamp_actor();

do $$
declare n_null_org int; n_no_creator int; has_touch bool; has_stamp bool;
begin
  select count(*) into n_null_org   from public.cx_conversation where organization_id is null;
  select count(*) into n_no_creator from public.cx_conversation where created_by is null;
  select exists(select 1 from pg_trigger where tgrelid='public.cx_conversation'::regclass and tgname='_touch_row')  into has_touch;
  select exists(select 1 from pg_trigger where tgrelid='public.cx_conversation'::regclass and tgname='_stamp_actor') into has_stamp;
  if n_null_org   > 0 then raise exception 'RETROFIT FAIL: % null-org rows remain', n_null_org; end if;
  if n_no_creator > 0 then raise exception 'RETROFIT FAIL: % rows missing created_by', n_no_creator; end if;
  if not has_touch then raise exception 'RETROFIT FAIL: _touch_row not attached'; end if;
  if not has_stamp then raise exception 'RETROFIT FAIL: _stamp_actor not attached'; end if;
  raise notice 'cx_conversation base retrofit OK';
end $$;
