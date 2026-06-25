-- cx_artifact_base_retrofit.sql
-- Applied 2026-06-24 (Wave 3 base-retrofit).
--
-- ADDITIVE. Has organization_id already (backfill nulls from the parent conversation);
-- adds created_by/updated_by/version; swaps the legacy cx_artifact_updated_at trigger for
-- the standard _touch_row. created_by = the artifact owner.
-- NOTE: cx_artifact has NO project/task mirror trigger, so project_id/task_id do NOT reach
-- platform.associations today — the artifact API must be repointed before those columns drop.
-- _version_capture + RLS flip + drops are separate gated steps. Idempotent.

alter table public.cx_artifact
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists version integer not null default 1;

drop trigger if exists cx_artifact_updated_at on public.cx_artifact;
drop trigger if exists _touch_row on public.cx_artifact;
drop trigger if exists _stamp_actor on public.cx_artifact;

update public.cx_artifact a
   set created_by      = a.user_id,
       organization_id = coalesce(a.organization_id, c.organization_id)
  from public.cx_conversation c
 where c.id = a.conversation_id
   and (a.created_by is null or a.organization_id is null);

update public.cx_artifact a
   set organization_id = (select o.id from public.organizations o
                          where o.is_personal and o.created_by = a.user_id
                          order by o.created_at limit 1)
 where a.organization_id is null;

create trigger _touch_row  before insert or update on public.cx_artifact
  for each row execute function platform._touch_row();
create trigger _stamp_actor before insert or update on public.cx_artifact
  for each row execute function platform._stamp_actor();

do $$
declare n_null_org int; n_no_creator int;
begin
  select count(*) into n_null_org   from public.cx_artifact where organization_id is null;
  select count(*) into n_no_creator from public.cx_artifact where created_by is null;
  if n_null_org   > 0 then raise exception 'cx_artifact: % null-org rows remain', n_null_org; end if;
  if n_no_creator > 0 then raise exception 'cx_artifact: % rows missing created_by', n_no_creator; end if;
  raise notice 'cx_artifact base retrofit OK';
end $$;
