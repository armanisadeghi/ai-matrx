-- education.deck_suggestion — the ethical contribution flywheel (P6 Phase C).
-- A user who studies a public community deck can suggest an improvement TO THE
-- OWNER (suggest-edit), who accepts/declines. Explicitly NOT an answer
-- marketplace — integrity-positive contribution only.
--
-- Writes go through SECURITY DEFINER RPCs (resolve+denormalize the deck owner,
-- gate resolution to the owner). Reads via RLS: a row is visible to its
-- contributor, the deck owner, or a super-admin. No public read.
--
-- Idempotent: safe to re-apply.

create table if not exists education.deck_suggestion (
  id             uuid primary key default gen_random_uuid(),
  resource_type  text not null default 'fc_set',
  resource_id    uuid not null,           -- the deck
  owner_id       uuid not null,           -- deck owner (denormalized for the inbox)
  suggested_by   uuid not null,           -- the contributor
  body           text not null,
  status         text not null default 'open',  -- open | accepted | declined
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists deck_suggestion_owner_idx
  on education.deck_suggestion (owner_id, status);
create index if not exists deck_suggestion_author_idx
  on education.deck_suggestion (suggested_by);
create index if not exists deck_suggestion_resource_idx
  on education.deck_suggestion (resource_type, resource_id);

grant select on education.deck_suggestion to authenticated;
grant all on education.deck_suggestion to service_role;

alter table education.deck_suggestion enable row level security;

-- Visible to the contributor, the deck owner, or a super-admin.
drop policy if exists ds_read on education.deck_suggestion;
create policy ds_read on education.deck_suggestion
  for select to authenticated
  using (
    suggested_by = (select auth.uid())
    or owner_id = (select auth.uid())
    or public.is_super_admin()
  );

drop policy if exists ds_service_all on education.deck_suggestion;
create policy ds_service_all on education.deck_suggestion
  for all to service_role using (true) with check (true);

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- Any authenticated user suggests an edit to a deck. Resolves + denormalizes
-- the owner from the resource; rejects suggesting on your own deck.
create or replace function public.edu_suggest_edit(
  p_resource_id   uuid,
  p_body          text,
  p_resource_type text default 'fc_set'
) returns education.deck_suggestion
language plpgsql security definer set search_path = public, education
as $$
declare
  v_owner uuid;
  v_uid   uuid := auth.uid();
  v_row   education.deck_suggestion;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body),'') = '' then
    raise exception 'suggestion body is required';
  end if;
  if p_resource_type <> 'fc_set' then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;

  select created_by into v_owner from education.fc_set
  where id = p_resource_id and deleted_at is null;
  if v_owner is null then
    raise exception 'deck % not found', p_resource_id;
  end if;
  if v_owner = v_uid then
    raise exception 'cannot suggest an edit to your own deck';
  end if;

  insert into education.deck_suggestion (resource_type, resource_id, owner_id, suggested_by, body)
  values (p_resource_type, p_resource_id, v_owner, v_uid, p_body)
  returning * into v_row;
  return v_row;
end;
$$;

-- The deck owner (or super-admin) resolves a suggestion.
create or replace function public.edu_resolve_suggestion(
  p_id     uuid,
  p_status text
) returns education.deck_suggestion
language plpgsql security definer set search_path = public, education
as $$
declare
  v_uid uuid := auth.uid();
  v_row education.deck_suggestion;
begin
  if p_status not in ('accepted','declined','open') then
    raise exception 'invalid status %', p_status;
  end if;
  update education.deck_suggestion set
    status = p_status,
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_id
    and (owner_id = v_uid or public.is_super_admin())
  returning * into v_row;
  if v_row.id is null then
    raise exception 'suggestion % not found or not yours', p_id;
  end if;
  return v_row;
end;
$$;

revoke all on function public.edu_suggest_edit(uuid,text,text) from anon;
revoke all on function public.edu_resolve_suggestion(uuid,text) from anon;
grant execute on function public.edu_suggest_edit(uuid,text,text) to authenticated;
grant execute on function public.edu_resolve_suggestion(uuid,text) to authenticated;
