-- ground-standing-ok: a — SIGNUP-DOOR, 2026-09-22. The census now shows what this file was
-- already written to survive: `platform._deprecated_write_guard()` IS attached somewhere other
-- than `content_ir.kind_instance` — measured today, `_deprecated_write_guard` on
-- `workbench.schema_templates`, put there by another lane. This file does not leave that trigger
-- standing over a dropped body; it REFUSES to run at all. The DO block below raises
-- "the write guard is still attached to %" before a single DROP executes, and tells the operator
-- to remove that lane's guard through that lane's own inverse first. Stopping is stronger than
-- detaching: detaching would silently take a peer's guard off `workbench.schema_templates`.
-- chair-step: this drops the deprecated schema's guard, its one verb and the schema itself, and deletes the deprecation rows the up-file wrote — no additive judgement admits any of that; it exists so the branch can be put back exactly as W1-REG found it
--
-- THE INVERSE of `migrations/campaign/w1_reg_the_deprecated_schema_and_its_guard.sql`.
--
-- Header-less on purpose (§4.9). The up-file is `-- target: branch` and so is every use
-- of this one:
--
--     pnpm db:apply migrations/inverse/w1_reg_the_deprecated_schema_and_its_guard_down.sql --target branch
--
-- IT REFUSES RATHER THAN DESTROYS. Schema `deprecated` is dropped only when it is EMPTY:
-- once `W7-DEPR-DATA` or `W7-DEPR-PLAT` has retired a real table into it, the only way
-- back is that lane's own inverse, and a `DROP SCHEMA … CASCADE` here would take a retired
-- production table's contents with it. It also refuses while any table other than
-- `content_ir.kind_instance` still carries the write guard, because dropping the guard
-- function would silently un-guard somebody else's retirement.
--
-- IT DELETES ONLY WHAT THE UP-FILE WROTE, and it knows which rows those are because the
-- up-file stamps each one: `REC-38 (W1-REG)%` for the hierarchy columns and the exact
-- `content_ir.kind_instance` row for REC-37. A row another lane wrote through
-- `platform.retire_to_deprecated()` carries a different reason and is left alone.

do $$
declare
  n int; v_tables text; v_guarded text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_tables
    from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
   where n2.nspname = 'deprecated' and c.relkind in ('r','p','m','f');
  if v_tables is not null then
    raise exception 'schema deprecated is NOT empty (%) — a retired table lives there', v_tables
      using hint = 'Run the inverse of the lane that retired it (W7-DEPR-DATA / W7-DEPR-PLAT) first. This file never drops retired data.';
  end if;

  select string_agg(t.tgrelid::regclass::text, ', ') into v_guarded
    from pg_trigger t
   where not t.tgisinternal
     and t.tgfoid = 'platform._deprecated_write_guard()'::regprocedure
     and t.tgrelid <> coalesce(to_regclass('content_ir.kind_instance'), 0::oid);
  if v_guarded is not null then
    raise exception 'the write guard is still attached to %', v_guarded
      using hint = 'Another lane guarded that table. Remove its guard through its own inverse before dropping the guard function.';
  end if;
end $$;

drop trigger if exists _deprecated_write_guard on content_ir.kind_instance;

update platform.entity_types
   set type = null,
       type_reason = null,
       custom_fields_enabled = false
 where schema_name = 'content_ir' and table_name = 'kind_instance'
   and type_reason like 'REC-37:%';

delete from platform.deprecated_relations where reason like 'REC-38 (W1-REG)%';
delete from platform.deprecated_relations where old_ref = 'content_ir.kind_instance' and reason like 'REC-37:%';
delete from platform.deprecated_relations where old_ref like 'zz_w1_reg.%';

drop function if exists platform.retire_to_deprecated(text, text, text, text);
drop function if exists platform._deprecated_write_guard();
drop schema if exists zz_w1_reg cascade;
drop schema if exists deprecated;

do $$
declare n int;
begin
  select count(*) into n from pg_namespace where nspname = 'deprecated';
  if n <> 0 then
    raise exception 'schema deprecated survived the inverse';
  end if;
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'platform' and p.proname in ('retire_to_deprecated', '_deprecated_write_guard');
  if n <> 0 then
    raise exception '% guard/verb function(s) survived the inverse', n;
  end if;
  select count(*) into n from platform.deprecated_relations
   where reason like 'REC-38 (W1-REG)%' or (old_ref = 'content_ir.kind_instance' and reason like 'REC-37:%');
  if n <> 0 then
    raise exception '% deprecation row(s) written by W1-REG survived the inverse', n;
  end if;
  select count(*) into n from platform.entity_types
   where schema_name = 'content_ir' and table_name = 'kind_instance' and type is not null;
  if n <> 0 then
    raise exception 'content_ir.kind_instance still carries a type after the inverse';
  end if;
  raise notice 'W1-REG: schema deprecated, the write guard, platform.retire_to_deprecated() and every deprecation row this lane wrote are gone; content_ir.kind_instance is untyped and unguarded again.';
end $$;
