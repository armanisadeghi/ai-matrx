-- INVERSE of migrations/campaign/enrich_a_field_a_model_owns.sql
--
-- It drops the eleven functions this lane created, their platform.client_callable_door
-- declarations and the five `custom/enrichment_*` knob rows. Nothing else is touched.
--
-- WHAT IT DOES NOT UNDO, and says so rather than pretending:
--   · A Field that was given `source = 'agent'` KEEPS that word and its `source_config`.
--     Those are keys the Field document has always carried; removing them would be deleting
--     somebody's configuration, and the forward file created neither the keys nor the
--     column. Nothing will fill the column in afterwards, because the doors that do are
--     gone — the field simply reads as "a model owns this" with no machinery behind it.
--   · Enrichment RUN records (`data_class = 'enrichment_run'`) stay. They are this
--     organization's own records of money it actually spent, and a paid call never loses
--     its cost record.
--   · Values an enrichment already landed stay exactly where they are, with their
--     provenance, their absence reasons and their alternates. They are values; the fact
--     that a model wrote them does not make them the migration's to remove.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('enrich_normalize', 'enrich_declare', 'enrichments', 'enrich_due',
                         'enrich_cells', 'enrich_land', 'enrich_pin', 'enrich_runs');

drop function if exists custom.enrich_runs(uuid, uuid, integer);
drop function if exists custom.enrich_pin(uuid, uuid, text, boolean);
drop function if exists custom.enrich_land(uuid, uuid, jsonb, jsonb);
drop function if exists custom.enrich_cells(uuid, uuid, text[], uuid[]);
drop function if exists custom.enrich_due(uuid, uuid, integer, boolean);
drop function if exists custom.enrichments(uuid, uuid);
drop function if exists custom.enrich_declare(uuid, uuid, jsonb);
drop function if exists custom.enrich_normalize(uuid, uuid, text, jsonb);
drop function if exists custom.enrich_triggers();
drop function if exists custom.enrich_sensitivity_rank(text);
drop function if exists custom.enrich_run_class();

-- The knob rows go only if no organization ever overrode them: an override is a decision
-- somebody took, and deleting the row it hangs off would delete that decision silently.
delete from platform.feature_knob k
 where k.feature = 'custom'
   and k.key in ('enrichment_model', 'enrichment_confidence_floor', 'enrichment_batch_ceiling',
                 'enrichment_cost_cap_cents', 'enrichment_sensitivity_ceiling')
   and not exists (select 1 from platform.knob_override o
                    where o.feature = k.feature and o.key = k.key);
