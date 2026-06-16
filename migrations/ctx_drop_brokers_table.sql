-- ctx_drop_brokers_table.sql
--
-- Drop the dead broker table. ctx_context_variables was the old flat key/value "broker"
-- store — verified 0 rows / 0 active, removed from resolve_full_context (only a comment
-- remains; no live function FROM/JOINs it), and no hand-written Python or live FE feature
-- reads it. Everything unified on Context Items (ctx_context_items / ctx_context_item_values,
-- written via the hardened set_context_value / set_scope_context_value). A rigorous
-- two-repo audit returned GO. CASCADE clears its 4 RLS policies + FKs.
--
-- After applying: run `python db/generate.py` to drop the generated CtxContextVariables
-- model/manager/DTO + relation helpers.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

DROP TABLE IF EXISTS public.ctx_context_variables CASCADE;
