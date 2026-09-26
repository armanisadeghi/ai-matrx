-- based-on: public.access_denied_context(text, uuid) 143bea2914d264344db6044982d99883af57c550c3f2cf133485cab7200a05cb
--
-- RC-A8 L1 (register row RC-A8; chair ruling 2026-09-26). A ROW INSIDE A RESTRICTED TABLE CARRIES
-- THE TABLE'S RESTRICTION: the container's visibility wins over the row being "in the organization".
--
-- The hole: public.access_denied_context's organization-admin arm (RC-A2m) kept the full answer for
-- any record whose OWN visibility is not personal. A Data Tables row is `internal` by default, so an
-- organization's admin who was never shared a Table set to "Only people I share it with" read each
-- row's owner and organization (measured on production, rolled back: test@test.com promoted to admin
-- of 884d1ce8 inside the transaction, admin@admin.com's Table ac68e71f set personal, row 727b7f9c
-- answered with admin's name and avatar; asking for it returned the request answer, not the blind one).
--
-- platform.held_by_its_organization(type, id) — is this record the organization's to oversee? False
-- when the record, or anything that holds it, is personal: a Data Tables row asks its Table
-- (custom.record.table_id), and every other record asks the parents platform.entity_relationships
-- declares (containment / composition), up to 8 levels. The org-admin arm asks it instead of the
-- row's own visibility, so the not-found page and the request door (which follows it) agree.
-- Forcing suite: aidream db/tests/test_rca8_a_row_follows_its_tables_restriction.py.
-- Inverse (rehearsal only): migrations/inverse/rca8c_a_row_follows_its_tables_restriction_down.sql

set local lock_timeout = '2s';

create or replace function platform.held_by_its_organization(p_type text, p_id uuid, p_depth integer default 0)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_meta   record;
  v_attrs  record;
  v_parent uuid;
  v_rel    record;
begin
  -- RC-A8 L1. SECURITY INVOKER: inside public.access_denied_context (definer) it reads every row;
  -- called by a client directly it reads only what that client may, and an unreadable row answers
  -- true — it never says more than the caller could already read.
  if p_type is null or p_id is null or p_depth > 8 then
    return true;
  end if;
  select et.schema_name, et.table_name into v_meta
    from platform.entity_types et where et.token = p_type and coalesce(et.is_active, true);
  if v_meta.schema_name is null then
    return true;
  end if;
  select * into v_attrs from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_id);
  if not coalesce(v_attrs.o_found, false) then
    return true;
  end if;
  if v_attrs.o_vis = 'personal'::platform.visibility then
    return false;
  end if;
  if p_type = 'record' then
    select r.table_id into v_parent from custom.record r where r.id = p_id;
    if v_parent is not null and v_parent <> p_id and v_parent <> custom.table_kernel_id() then
      return platform.held_by_its_organization('record', v_parent, p_depth + 1);
    end if;
    return true;
  end if;
  for v_rel in
    select er.parent_type, er.fk_column
      from platform.entity_relationships er
     where er.child_type = p_type and er.kind in ('containment', 'composition')
  loop
    begin
      execute format('select %I from %I.%I where id = $1', v_rel.fk_column, v_meta.schema_name, v_meta.table_name)
        into v_parent using p_id;
    exception when undefined_column or datatype_mismatch then
      v_parent := null;
    end;
    if v_parent is not null and not platform.held_by_its_organization(v_rel.parent_type, v_parent, p_depth + 1) then
      return false;
    end if;
  end loop;
  return true;
end;
$fn$;

comment on function platform.held_by_its_organization(text, uuid, integer) is
  'RC-A8 L1: true when a record is its organization''s to oversee — neither it nor anything that holds it (a Data Tables row''s Table, a declared containment/composition parent) is personal. Asked by access_denied_context''s organization-admin arm.';

do $patch$
declare
  v_def text := pg_get_functiondef('public.access_denied_context(text,uuid)'::regprocedure);
  v_anchor text := $a$              and v_attrs.o_vis is distinct from 'personal'::platform.visibility
$a$;
  v_repl text := $a$              -- RC-A8 L1: the container's visibility wins (a row of a personal Table is personal)
              and platform.held_by_its_organization(v_meta.token, p_id)
$a$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'rca8c patch: anchor occurs % time(s) in public.access_denied_context, expected 1 — nothing was changed', v_n;
  end if;
  execute replace(v_def, v_anchor, v_repl);
end
$patch$;
