-- education.content_certification — the "Certified" editorial verification mark
-- for the community library (P6 Phase C). An admin-granted trust signal
-- (Brainscape's model, our integrity framing) displayed across the library +
-- study surfaces. Polymorphic by (resource_type, resource_id) so it certifies
-- fc_set decks now and quizzes/others later without schema change.
--
-- Protected-style: PUBLIC read (badges render signed-out, everywhere), but the
-- ONLY write path is super-admin-gated SECURITY DEFINER RPCs. No user writes.
--
-- Idempotent: safe to re-apply.

create table if not exists education.content_certification (
  id             uuid primary key default gen_random_uuid(),
  resource_type  text not null,          -- entity token, e.g. 'fc_set'
  resource_id    uuid not null,
  note           text,                    -- optional editorial note
  certified_by   uuid not null,           -- the super-admin who granted it
  certified_at   timestamptz not null default now()
);

create unique index if not exists content_certification_resource_key
  on education.content_certification (resource_type, resource_id);

-- Grants: everyone reads (badges are public); only the definer RPCs write.
grant select on education.content_certification to anon, authenticated;
grant all on education.content_certification to service_role;

alter table education.content_certification enable row level security;

-- Public read for all; no user INSERT/UPDATE/DELETE policy → only service_role
-- (svc) + SECURITY DEFINER RPCs can write.
drop policy if exists cc_public_read on education.content_certification;
create policy cc_public_read on education.content_certification
  for select to anon, authenticated using (true);

drop policy if exists cc_service_all on education.content_certification;
create policy cc_service_all on education.content_certification
  for all to service_role using (true) with check (true);

-- ── Admin RPCs (super-admin only) ────────────────────────────────────────────
create or replace function public.edu_certify_content(
  p_resource_type text,
  p_resource_id   uuid,
  p_note          text default null
) returns education.content_certification
language plpgsql security definer set search_path = public, education
as $$
declare
  v_row education.content_certification;
  v_uid uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into education.content_certification (resource_type, resource_id, note, certified_by)
  values (p_resource_type, p_resource_id, p_note, v_uid)
  on conflict (resource_type, resource_id)
    do update set note = excluded.note, certified_by = v_uid, certified_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.edu_uncertify_content(
  p_resource_type text,
  p_resource_id   uuid
) returns void
language plpgsql security definer set search_path = public, education
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from education.content_certification
  where resource_type = p_resource_type and resource_id = p_resource_id;
end;
$$;

revoke all on function public.edu_certify_content(text,uuid,text) from anon;
revoke all on function public.edu_uncertify_content(text,uuid) from anon;
grant execute on function public.edu_certify_content(text,uuid,text) to authenticated;
grant execute on function public.edu_uncertify_content(text,uuid) to authenticated;
