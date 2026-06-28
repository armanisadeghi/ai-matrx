-- Migration: reg_tables_schema_move
-- Move 11 KG/suggestion tables from public to reg schema
-- ALTER TABLE SET SCHEMA preserves data, indexes, triggers, FK constraints

ALTER TABLE public.kg_alerts SET SCHEMA reg;
ALTER TABLE public.kg_suggestion_ack SET SCHEMA reg;
ALTER TABLE public.kg_value_matches SET SCHEMA reg;
ALTER TABLE public.ner_canonicalizer_shadow SET SCHEMA reg;
ALTER TABLE public.kg_sweep_queue SET SCHEMA reg;
ALTER TABLE public.kg_sweep_run SET SCHEMA reg;
ALTER TABLE public.kg_sweep_state SET SCHEMA reg;
ALTER TABLE public.scope_suggestions SET SCHEMA reg;
ALTER TABLE public.scope_association_suggestions SET SCHEMA reg;
ALTER TABLE public.scope_item_value_suggestions SET SCHEMA reg;
ALTER TABLE public.context_item_suggestions SET SCHEMA reg;
