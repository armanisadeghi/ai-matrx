-- chair-step: dropping the external tier's two provisioned tables, their doors, their registry rows and the private schema custom_external is this lane's teardown, never an additive change, and it reaches production only at a terminal with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w1_tier_external_tier.sql` (§4.13, rule 27).
--
-- IT UNDOES WHAT `platform.provision` WROTE, NOT ONLY THE DDL — the table, its indexes, its
-- view, its functions, its `platform.client_callable_door` rows, its
-- `platform.stamped_write_table` row, its `platform.entity_relationships` rows, its
-- `platform.entity_types` row and its capture row. An inverse that dropped the tables alone
-- would leave the registry naming relations that no longer exist, which is the shape
-- `provision_shape_guard` exists to refuse.
--
-- 🚨 IT NEVER DROPS SCHEMA `custom`. This lane holds no lock and owns only its reserved
-- prefix: `custom.external_*` plus the private schema `custom_external`. Eleven other lanes
-- build in `custom`, so everything below is dropped BY NAME. `custom_external` is dropped
-- only when it is empty — a foreign table somebody created there is a later lane's or a
-- bought connection's, and this file names it rather than taking it with them.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $$
declare
  v_strays text;
  v_rows   bigint;
begin
  -- ── the private schema: only if this lane's own creation is all that is there ──
  if to_regnamespace('custom_external') is null then
    raise notice 'schema custom_external is already absent — nothing to undo.';
  else
    select string_agg(format('%s.%s', n.nspname, c.relname), ', ' order by c.relname)
      into v_strays
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'custom_external'
       and c.relkind in ('r','p','v','m','f');
    if v_strays is not null then
      raise exception
        'REFUSING to drop schema custom_external: it holds relation(s) this file did not create — %. '
        'DOOR-N-6 puts every foreign-data-wrapper table there; dropping the schema would take a '
        'bought connection with it. Drop those relations by name first.', v_strays;
    end if;
    drop schema custom_external;
    raise notice 'W1-TIER inverse: schema custom_external dropped.';
  end if;

  if to_regclass('custom.external_link') is not null then
    execute 'select count(*) from custom.external_link' into v_rows;
    if v_rows > 0 then
      raise notice 'custom.external_link holds % row(s); they are DELETED below while the table itself stays standing (two bodies outside this lane read it on the live path — see the header). The stub Records they point at are ordinary rows of custom.record and are NOT touched — a stub that loses its link is a native record again.', v_rows;
    end if;
  end if;
end
$$;

-- ── the functions, by name (a table DROP does not take them) ───────────────────
drop function if exists custom.external_rows(uuid, uuid);
drop function if exists custom.external_history_event(uuid, uuid, text);
drop function if exists custom.external_write_through(uuid, uuid, jsonb);
drop function if exists custom.external_stub_upsert(uuid, uuid, uuid, text, text, text);
drop function if exists custom.external_foreign_table_findings();
drop function if exists custom.relation_target_external(text, text, text);
drop function if exists custom.relation_target_ours(text, uuid);
drop function if exists custom.external_tier_contract();
drop function if exists custom.external_writes_set(uuid, uuid, boolean);
drop function if exists custom.external_source_declare(uuid, text, text, text, text, text);

-- ── the view and the two tables, link first (its FK names the source) ──────────
drop view if exists custom.external_record;

-- 🚨 `custom.external_link` STAYS STANDING, AND IS EMPTIED (lane INVERSE-GUARD, 2026-09-21).
-- TWO BODIES OUTSIDE THIS LANE NAME THE TABLE ON THE LIVE PATH, and neither knew the external
-- tier existed:
--   · `platform.relation_label` (`argsruled_the_far_end_of_a_relation_is_decided_too.sql`)
--     falls back to `select l.cached_title from custom.external_link l` whenever a record's
--     own title field is null — which is most records — so every relation card label would
--     raise `relation "custom.external_link" does not exist`.
--   · `platform.enforce_relation_edge` (`w1_rel_the_edge_enforces_the_declaration.sql`) reads
--     it to resolve an external far end, and it is what the live trigger
--     `trg_associations_zzz_relation_contract` on `platform.associations` runs — so the next
--     write to the association store would raise too.
-- Dropping the table would not restore this lane's defect; it would take the record store's
-- title lookup and the relation contract with it. So the table is LEFT WHERE IT IS and EMPTIED
-- (the mergehist remedy). Everything that made it a TIER is still taken away below and above:
-- the private schema, the view, the ten functions, the doors, the stamped-write rows, the
-- entity registry rows and the provisioning declaration. What is left is an empty table nobody
-- can reach through any door — which is the pre-W1-TIER world as far as every caller is
-- concerned, and a `cached_title` lookup that finds nothing, exactly as it did before.
delete from custom.external_link;
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'custom.external_link'::regclass and contype = 'f' loop
    execute format('alter table custom.external_link drop constraint %I', c.conname);
  end loop;
end
$$;
--   drop table if exists custom.external_link;   -- deliberately NOT dropped

drop table if exists custom.external_source;

-- ── what platform.provision wrote beside the DDL ───────────────────────────────
delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by in ('platform.provision(external_source)', 'platform.provision(external_link)');
delete from platform.stamped_write_table
 where schema_name = 'custom' and table_name in ('external_source', 'external_link')
   and declared_by in ('platform.provision(external_source)', 'platform.provision(external_link)');
delete from platform.entity_relationships
 where child_type in ('external_source', 'external_link')
    or parent_type in ('external_source', 'external_link');
delete from platform.entity_types
 where token in ('external_source', 'external_link') and schema_name = 'custom';

-- 🚨 platform.provision_spec IS APPEND-ONLY and a DELETE is refused by
-- `platform._provision_spec_is_append_only()` with "the applied declaration IS the record".
-- So the teardown is RECORDED rather than erased: one `deprovision` row per token, carrying
-- the same declaration, becomes that token's current row.
insert into platform.provision_spec (
  token, spec, spec_hash, type, origin, owner_org_id, verb, result,
  applied_by, applied_via, artifacts_status, applied_lane, applied_actor, applied_role)
select s.token, s.spec, s.spec_hash, s.type, s.origin, s.owner_org_id, 'deprovision',
       jsonb_build_object('created', '[]'::jsonb, 'certify', '[]'::jsonb,
                          'note', 'migrations/inverse/w1_tier_external_tier_down.sql dropped the external tier: custom.external_source, the view, ten functions, the door rows, the stamped-write rows, the registry rows and the private schema custom_external. custom.external_link is left standing and EMPTY because platform.relation_label and platform.enforce_relation_edge read it on the live path.'),
       session_user, 'runner', 'complete', 'full', null, session_user
  from platform.v_provision_spec_current s
 where s.token in ('external_source', 'external_link') and s.verb <> 'deprovision';

-- and the exemption the guard must NOT be left holding for a name nobody now owns
delete from platform.provision_spec_grandfather
 where lane = 'unprovisioned_relation'
   and object_ref in ('custom.external_source', 'custom.external_link');
