-- draft: DD-065 batch 1 CONTRACT — clone-proven 2026-10-02, NOT applied to production. Remove this line to apply.
-- chair-step: lane ONE-HOME, DD-065 batch 1 (contract). Data Doctrine §3.2 + §7, R16 (one name per fact):
--   extend.wbx_demo / wbx_guidance / wbx_highlight   is_deleted -> deleted_at   (retype; bridge from the expand file)
--   legal.wc_claim                                   is_public  -> visibility   (retype; bridge _bridge_is_public)
--   education.study_structured_section               owner_id   -> created_by   (merge; 0 rows)
--   education.study_source_chunk                     owner_id   -> created_by   (rename; 0 rows, no created_by yet)
-- PRECONDITION (not checkable here): the code edits in dd065-batch1-*.patch are released — aidream (ORM models
-- regenerated, wc_claim never selects is_public), matrx-extend (reads/writes deleted_at, published build is the
-- floor), matrx-frontend (types regenerated). Run AFTER the expand file.
-- Each table refuses by name if its two columns disagree, so no meaning is lost.
-- Locks: ACCESS EXCLUSIVE per table for DROP/RENAME COLUMN — instant (catalog only); tables of 0..95 rows.
-- Idempotent: every step checks the column first; a second run finds nothing to do.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- 0. preconditions --------------------------------------------------------------------------------------------
do $$
declare n bigint; t text;
begin
  foreach t in array array['wbx_demo','wbx_guidance','wbx_highlight'] loop
    if exists (select 1 from pg_attribute where attrelid = format('extend.%I', t)::regclass
                and attname = 'is_deleted' and not attisdropped) then
      execute format('select count(*) from extend.%I where is_deleted is distinct from (deleted_at is not null)', t) into n;
      if n <> 0 then raise exception 'DD-065 b1: extend.% has % rows where is_deleted and deleted_at disagree — run the expand file', t, n; end if;
    end if;
  end loop;

  if exists (select 1 from pg_attribute where attrelid = 'legal.wc_claim'::regclass and attname = 'is_public' and not attisdropped) then
    execute 'select count(*) from legal.wc_claim where coalesce(is_public,false) is distinct from (visibility = ''public''::platform.visibility)' into n;
    if n <> 0 then raise exception 'DD-065 b1: legal.wc_claim has % rows where is_public and visibility disagree', n; end if;
  end if;

  if exists (select 1 from pg_attribute where attrelid = 'education.study_structured_section'::regclass and attname = 'owner_id' and not attisdropped) then
    execute 'update education.study_structured_section set created_by = owner_id where created_by is null and owner_id is not null';
    execute 'select count(*) from education.study_structured_section where owner_id is distinct from created_by' into n;
    if n <> 0 then raise exception 'DD-065 b1: education.study_structured_section has % rows where owner_id and created_by name different people', n; end if;
  end if;
end $$;

-- 1. extend: is_deleted -> deleted_at -------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wbx_demo','wbx_guidance','wbx_highlight'] loop
    execute format('drop trigger if exists _0_soft_delete_follows_deleted_at on extend.%I', t);
    execute format('alter table extend.%I drop column if exists is_deleted', t);   -- drops the 4 is_deleted partial indexes
  end loop;
end $$;
drop function if exists extend._soft_delete_follows_deleted_at();

do $$
declare r record;
begin
  for r in select * from (values ('wbx_highlight_owner_conv_live','wbx_highlight_owner_conv'),
                                 ('wbx_highlight_owner_domain_live','wbx_highlight_owner_domain'),
                                 ('wbx_highlight_owner_recent_live','wbx_highlight_owner_recent'),
                                 ('wbx_highlight_owner_url_live','wbx_highlight_owner_url')) v(live, final) loop
    if to_regclass('extend.'||r.live) is not null and to_regclass('extend.'||r.final) is null then
      execute format('alter index extend.%I rename to %I', r.live, r.final);
    end if;
  end loop;
end $$;

-- 2. legal.wc_claim: is_public -> visibility ------------------------------------------------------------------
drop trigger if exists _bridge_is_public on legal.wc_claim;
drop function if exists legal._bridge_wc_claim_is_public();
alter table legal.wc_claim drop column if exists is_public;          -- drops wc_claim_is_public_idx

-- 3. education.study_structured_section: owner_id merges into created_by --------------------------------------
alter table education.study_structured_section drop column if exists owner_id;   -- drops its FK and owner index
create index if not exists idx_study_structured_section_created_by
  on education.study_structured_section (created_by, created_at desc);

-- 4. education.study_source_chunk: owner_id is renamed created_by ---------------------------------------------
do $$
begin
  if exists (select 1 from pg_attribute where attrelid = 'education.study_source_chunk'::regclass and attname = 'owner_id' and not attisdropped)
     and not exists (select 1 from pg_attribute where attrelid = 'education.study_source_chunk'::regclass and attname = 'created_by' and not attisdropped) then
    alter table education.study_source_chunk rename column owner_id to created_by;   -- policies, FK, index follow by attnum
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'education.study_source_chunk'::regclass and conname = 'study_source_chunk_owner_id_fkey') then
    alter table education.study_source_chunk rename constraint study_source_chunk_owner_id_fkey to study_source_chunk_created_by_fkey;
  end if;
  if to_regclass('education.idx_study_source_chunk_owner') is not null then
    alter index education.idx_study_source_chunk_owner rename to idx_study_source_chunk_created_by;
  end if;
end $$;

-- 5. postcondition + PostgREST -------------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from iam.legacy_column_worklist()
   where (schema_name, table_name) in (('extend','wbx_demo'),('extend','wbx_guidance'),('extend','wbx_highlight'),
                                       ('education','study_structured_section'),('education','study_source_chunk'))
      or (schema_name, table_name, legacy_column) = ('legal','wc_claim','is_public');
  if n <> 0 then raise exception 'DD-065 b1: % legacy columns remain on the batch-1 tables', n; end if;
end $$;

notify pgrst, 'reload schema';
