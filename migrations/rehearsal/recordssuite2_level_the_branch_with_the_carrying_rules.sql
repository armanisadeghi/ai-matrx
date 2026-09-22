-- target: branch
--
-- LEVEL THE REHEARSAL BRANCH WITH MAIN'S THREE CARRYING RULES.
--
-- WHY
-- ---
-- `custom.carrying_rule` says what a structural role on a record CONVEYS: `contains` (REC-7's
-- parent), `home` (REC-26's placement) and `references` (REL-6's carrying link). It is also the
-- exemption list `custom._store_relation_edge_names_its_field` reads — that trigger refuses, with
-- SQLSTATE 23514, any association out of the record store that names no `relation_field_id`
-- UNLESS its role is a row in this table.
--
-- Main carries three rows. The rehearsal branch, after the first live BRANCH-REFRESH, carried
-- ZERO — the refresh's seed derivation is scoped to schema `platform`, so a campaign-owned
-- schema's own reference table was never visible to it. The trigger is BYTE-IDENTICAL on both
-- databases (sha256 7989b42e9efb… of `pg_get_functiondef`, compared 2026-09-22), so this is
-- purely the lookup being absent.
--
-- The effect was not subtle: with the table empty, every `table_propose` through the store died
-- with `a relation on a record has to say which field it came from, and "contains" does not` —
-- 24 of the 24 errors in lane RECORDS-SUITE-2's branch run, one absent lookup wearing the costume
-- of a broken door.
--
-- THE CLASS FIX IS IN THE REFRESH: `scripts/night/branch-refresh.sh` now names
-- `custom.carrying_rule` in `NAMED_REGISTRIES` (the first entry outside `platform`, and its copy
-- loop already handles a table with no `organization_id`). This file is the instance fix so the
-- store's suite can be classified today.
--
-- NO CUSTOMER DATA. Three role words and their sentences; the table has no `organization_id`.
-- ADDITIVE and idempotent: `on conflict (role) do nothing`, no DDL, no DROP, no REVOKE. Every
-- value below was read from main with a SELECT on 2026-09-22.
--
-- lane: RECORDS-SUITE-2

insert into custom.carrying_rule (role, kind, container_side, conveys_max, is_active, note)
values
    ('contains', 'containment', 'source', 'admin', true,
     'A record inside a record. Carries up to admin; the minimum along the path decides the rest.'),
    ('home', 'home', 'source', 'admin', true,
     'VIS-5. A Table homed in a Record. Sharing the Record shares the existence, name and Fields of the Table, because the Table is itself a record and this edge carries. A principal not shared reaches no edge and the Table does not appear in any answer.'),
    ('references', 'reference', 'source', 'viewer', true,
     'T11. A referenced relation that carries. Capped at viewer: sharing A with Dana as editor makes her a VIEWER of B, the level stepped down, never an editor of B.')
on conflict (role) do nothing;

do $$
declare n int;
begin
    select count(*) into n from custom.carrying_rule where is_active and role in ('contains','home','references');
    if n <> 3 then
        raise exception 'custom.carrying_rule carries % of the 3 structural roles; custom._store_relation_edge_names_its_field refuses every store edge whose role is not one of them', n;
    end if;
end $$;
