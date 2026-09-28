-- chair-step: a DATA REPAIR. It UPDATEs the stored `label_plural` of the Tables whose plural is exactly their own name (or singular) plus a machine's extra "s" AND therefore ends in "ss" — "Rincon Plumbing — Customers" / "Rincon Plumbing — Customerss" — to what custom.plural_of says for that word, which for a word already ending in s is the word itself. Before it changes a row it writes the row's id, organization, the word and BOTH values into campaign_watch.gridtails_plural_repair, so the inverse restores the exact prior value and nothing else. An UPDATE is refused by name on the production allow-list, so it comes through this route. Every row changed goes through custom.record's own triggers (history captures each one). A plural a person typed that ends in "ss" but is NOT the word plus "s" (a "Business" table whose plural is "Business") is never touched. ORDER: after gridtails_a_tables_plural_is_worked_out_not_an_extra_s.sql (it asks custom.plural_of). Inverse: migrations/inverse/gridtails_a_stored_plural_loses_the_machines_extra_s_down.sql.
-- lane: GRID-TAILS
-- lock: custom
--
-- WHAT IT CHANGES ON PRODUCTION (read 2026-09-24 ~00:10 PT, read-only): 11 rows, 9 live and 2 in
-- the trash —
--   Continent options, Regions options, Status options (choice tables the mover copied),
--   matrx-frontend (LCP test) — Known defects, matrx-frontend (LCP lcp-test-mu7c6pdn) — Known defects,
--   Rincon Plumbing — Customers, Rincon Plumbing — Service Calls, Surface Write Test — Data Tables,
--   weather_cities, and in the trash V6 T2 Class, ZZZ class.
-- It does NOT change V7 T3 Class / V7 T3b Class / V7 T3c Class, whose stored plural is the word
-- itself (not the word + "s"). The authoritative list is what this file writes into
-- campaign_watch.gridtails_plural_repair, read back after the apply.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists campaign_watch.gridtails_plural_repair (
  record_id             uuid        not null primary key,
  organization_id       uuid        not null,
  base_word             text        not null,
  prior_label_plural    text        not null,
  repaired_label_plural text        not null,
  was_in_trash          boolean     not null,
  repaired_at           timestamptz not null default now()
);

comment on table campaign_watch.gridtails_plural_repair is
  'GRID-TAILS: every Table plural the machine''s extra-s repair changed, with the exact prior value, so the inverse restores it.';

insert into campaign_watch.gridtails_plural_repair
       (record_id, organization_id, base_word, prior_label_plural, repaired_label_plural, was_in_trash)
select r.id, r.organization_id, b.base, r.data ->> 'label_plural', custom.plural_of(b.base), r.deleted_at is not null
  from custom.record r
 cross join lateral (
   select case when r.data ->> 'label_plural' = (r.data ->> 'label_singular') || 's' then r.data ->> 'label_singular'
               else r.data ->> 'name' end as base
 ) b
 where r.table_id = custom.table_kernel_id()
   and r.data ->> 'label_plural' like '%ss'
   and (r.data ->> 'label_plural' = (r.data ->> 'label_singular') || 's'
        or r.data ->> 'label_plural' = (r.data ->> 'name') || 's')
   and custom.plural_of(b.base) is distinct from r.data ->> 'label_plural'
on conflict (record_id) do nothing;

update custom.record r
   set data = jsonb_set(r.data, '{label_plural}', to_jsonb(a.repaired_label_plural))
  from campaign_watch.gridtails_plural_repair a
 where r.organization_id = a.organization_id
   and r.id = a.record_id
   and r.table_id = custom.table_kernel_id()
   and r.data ->> 'label_plural' = a.prior_label_plural;
