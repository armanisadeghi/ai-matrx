-- LANE SCOPES-READS-ACCESS — A MEMBER EDITS A SCOPE IN THE STORE AS SHE DOES TODAY (chair ruling 2026-09-29 (5)),
-- measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Titanium files its work under shared tags; any member of the firm renames or re-describes a tag
-- (the old scope rules give every member editor on every internal scope). When the tag screens write through the
-- store's own doors, the store must let that member edit the tag too — and must still let an owner say otherwise
-- for one Table, and still honour an organization that shows members only what is shared with them.
--
-- The seat: admin@admin.com, a plain member of Titanium. Rolled back; nothing is kept.
--
-- WHAT MAKES IT FAIL (RED before scopesaccess_a_member_edits_a_scope_as_she_does_today.sql):
--   E1  the old rule: the member holds editor on the tag through the access kernel's scope lane (fixture)
--   E2  the store's ladder gives the member editor on the tag's Record                      ← RED before
--   E3  every live context Table says a member level                                         ← RED before
--   E4  an owner who set one Table to viewer keeps viewer through the copy's next write of that type
--   E5  a data Table of the same organization is unchanged (the organization's own default)
--   E6  an organization showing members only what is shared gives the member nothing, as before

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_a_member_edits_a_scope_as_she_does_today_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '20s';

-- (Separate statements: the access kernel memoizes an answer for the length of one statement.)
create temp table e_fx on commit drop as
  select '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as me, 'f9cb3e35-2a65-4f2a-8525-088d6551071c'::uuid as org,
         null::uuid as tag, null::uuid as type;
do $t$
declare f e_fx;
begin
  select * into f from e_fx;
  if (select m.role from iam.memberships m where m.container_type = 'organization' and m.container_id = f.org
        and m.user_id = f.me and m.deleted_at is null and m.status = 'active') is distinct from 'member' then
    raise exception 'FIXTURE: admin@admin.com is not a plain member of Titanium';
  end if;
  -- a scope she did not make, of a type she did not make (so no owner's arm answers for her)
  update e_fx set (tag, type) = (select s.id, s.scope_type_id from context.scopes s join custom.record r on r.id = s.id
     join context.scope_types st on st.id = s.scope_type_id join custom.record t on t.id = st.id
     where s.organization_id = f.org and s.deleted_at is null and s.visibility = 'internal' and st.deleted_at is null
       and s.created_by is distinct from f.me and st.created_by is distinct from f.me and t.created_by is distinct from f.me
       and r.deleted_at is null order by s.id limit 1);
  if (select tag from e_fx) is null then raise exception 'FIXTURE: no scope of Titanium fits'; end if;
end $t$;
do $t$
declare f e_fx;
begin
  select * into f from e_fx;
  if not iam.has_access_for(f.me, 'scope', f.tag, 'editor') then
    raise exception 'E1 FIXTURE: the old scope rules do not give the member editor on %', f.tag;
  end if;
  if not custom.has_visibility(f.me, 'record', f.tag, 'editor') then
    raise exception 'E2 RED: a member of Titanium may edit tag % today and the store refuses her editor', f.tag;
  end if;
  if exists (select 1 from custom.record t where t.table_id = custom.table_kernel_id()
              and t.data @> '{"kept_for": "context"}'::jsonb and t.deleted_at is null and not (t.data ? 'member_default_level')) then
    raise exception 'E3 RED: % live context Tables say no member level',
      (select count(*) from custom.record t where t.table_id = custom.table_kernel_id()
          and t.data @> '{"kept_for": "context"}'::jsonb and t.deleted_at is null and not (t.data ? 'member_default_level'));
  end if;
end $t$;
-- E4: the owner sets this type's Table to viewer; the copy writes the type again; viewer stays.
do $t$
declare f e_fx; v_lvl text;
begin
  select * into f from e_fx;
  update custom.record set data = data || '{"member_default_level": "viewer"}'::jsonb where organization_id = f.org and id = f.type;
  perform custom._ctx_store_type(f.org, f.type, (select to_jsonb(st) from context.scope_types st where st.id = f.type));
  select data ->> 'member_default_level' into v_lvl from custom.record where organization_id = f.org and id = f.type;
  if v_lvl is distinct from 'viewer' then
    raise exception 'E4 RED: the owner''s viewer on the Table became % after the copy wrote the type', v_lvl;
  end if;
end $t$;
do $t$
declare f e_fx;
begin
  select * into f from e_fx;
  if custom.has_visibility(f.me, 'record', f.tag, 'editor') then
    raise exception 'E4 RED: the owner set the Table to viewer and the member still edits %', f.tag;
  end if;
  update custom.record set data = data || '{"member_default_level": "editor"}'::jsonb where organization_id = f.org and id = f.type;
end $t$;
-- E5 and E6
do $t$
declare f e_fx; v_data uuid;
begin
  select * into f from e_fx;
  select t.id into v_data from custom.record t where t.organization_id = f.org and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null and coalesce(t.data ->> 'kept_for', '') <> 'context' and not (t.data ? 'member_default_level') limit 1;
  if v_data is not null and iam.member_default_level(f.org, v_data) is distinct from iam.member_default_level(f.org, null) then
    raise exception 'E5 RED: a data Table of Titanium moved off the organization''s own default';
  end if;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'member_default_visibility', 'organization', f.org, f.org, '"shared_only"'::jsonb, 'scopesaccess suite E6')
  on conflict do nothing;
  update platform.knob_override set value = '"shared_only"'::jsonb
   where feature = 'custom' and key = 'member_default_visibility' and scope_kind = 'organization' and scope_id = f.org;
end $t$;
do $t$
declare f e_fx;
begin
  select * into f from e_fx;
  if custom.has_visibility(f.me, 'record', f.tag, 'editor') then
    raise exception 'E6 RED: Titanium shows members only what is shared and the member still edits %', f.tag;
  end if;
  raise notice 'GREEN E1–E6: a member edits a tag in the store as she does today; an owner''s viewer is kept; a data Table and a members-see-shared-only organization are unchanged.';
end $t$;

rollback;
