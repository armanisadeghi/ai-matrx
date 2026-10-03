-- draft: DD-065 batch 1 EXPAND — clone-proven 2026-10-02, NOT applied to production. Remove this line to apply.
-- chair-step: lane ONE-HOME, DD-065 batch 1 (expand). Data Doctrine §3.2 + §7: soft delete is `deleted_at`;
-- `is_deleted` is retired. The three matrx-extend tables carry both, and nothing keeps them in step:
-- the extension writes `is_deleted = true` and leaves `deleted_at` NULL (clone probe 2026-10-02:
-- "is_deleted=t deleted_at_set=f"), so a row the person deleted still reads as live to every
-- deleted_at reader (search, lifecycle, the canonical lists).
-- What this file does (additive only, safe while old extension builds are still installed):
--   1. A BEFORE trigger on the three tables keeps the two in step, whichever one the writer states;
--      deleted_at wins when both change.
--   2. Backfill: any row where they disagree takes the union (deleted if either says deleted).
--   3. The four partial indexes on wbx_highlight get deleted_at twins (14 rows; plain CREATE INDEX).
-- Locks: SHARE ROW EXCLUSIVE for CREATE TRIGGER, SHARE for CREATE INDEX — tables of 0/0/14 rows.
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS / CREATE INDEX IF NOT EXISTS; backfill finds 0.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

create or replace function extend._soft_delete_follows_deleted_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
-- DD-065 bridge (expand step). Dropped with the is_deleted column in the contract step.
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      new.is_deleted := true;
    elsif coalesce(new.is_deleted, false) then
      new.deleted_at := now();
    else
      new.is_deleted := false;
    end if;
  elsif new.deleted_at is distinct from old.deleted_at then
    new.is_deleted := (new.deleted_at is not null);          -- canonical writer wins
  elsif new.is_deleted is distinct from old.is_deleted then
    new.deleted_at := case when coalesce(new.is_deleted, false)
                           then coalesce(new.deleted_at, now()) end;   -- legacy writer
  end if;
  return new;
end
$fn$;

comment on function extend._soft_delete_follows_deleted_at() is
  'DD-065 expand bridge: keeps is_deleted and deleted_at in step until is_deleted drops (batch 1 contract).';

do $$
declare t text;
begin
  foreach t in array array['wbx_demo','wbx_guidance','wbx_highlight'] loop
    execute format('drop trigger if exists _0_soft_delete_follows_deleted_at on extend.%I', t);
    execute format('create trigger _0_soft_delete_follows_deleted_at before insert or update on extend.%I
                    for each row execute function extend._soft_delete_follows_deleted_at()', t);
    -- union backfill: deleted if either column says deleted
    execute format('update extend.%I set deleted_at = coalesce(deleted_at, updated_at, now()), is_deleted = true
                     where is_deleted is distinct from (deleted_at is not null)', t);
  end loop;
end $$;

create index if not exists wbx_highlight_owner_conv_live   on extend.wbx_highlight (created_by, conversation_id) where deleted_at is null;
create index if not exists wbx_highlight_owner_domain_live on extend.wbx_highlight (created_by, domain)          where deleted_at is null;
create index if not exists wbx_highlight_owner_recent_live on extend.wbx_highlight (created_by, updated_at desc) where deleted_at is null;
create index if not exists wbx_highlight_owner_url_live    on extend.wbx_highlight (created_by, url)             where deleted_at is null;

do $$
declare n bigint;
begin
  select (select count(*) from extend.wbx_demo      where is_deleted is distinct from (deleted_at is not null))
       + (select count(*) from extend.wbx_guidance  where is_deleted is distinct from (deleted_at is not null))
       + (select count(*) from extend.wbx_highlight where is_deleted is distinct from (deleted_at is not null))
    into n;
  if n <> 0 then
    raise exception 'DD-065 b1 expand: % rows still disagree between is_deleted and deleted_at', n;
  end if;
end $$;
