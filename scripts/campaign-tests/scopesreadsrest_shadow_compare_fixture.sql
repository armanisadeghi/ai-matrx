-- THE COPY IS EXACT (fixture, inside the rolled-back transaction, triggers off). The shadow compare
-- proves the BODIES; so that a data difference between the older tables and the store cannot pass for
-- a body difference (or hide one), the store's copy is first made to say exactly what the older rows
-- say in the columns these bodies read. Every class carried here is measured and named in
-- PROGRESS-SCOPES-READS-REST.md, with its production count:
--   F1 scope slug          — clone only: 676 live scopes of 3 organizations the clone copied before
--                            production's Step 1 (2026-09-29 20:04Z) carried them; production 0 live.
--   F2 context item author — the store Field's created_by (production: 217 differ, mostly null).
--   F3 scope type author   — the Table's created_by (production: 33 differ; older null, store admin).
--   F4 an item switched off but not archived on the older side is an archived Field (production 2).
--   F5 an item key the store renamed when it freed it (production 1).
set local session_replication_role = replica;
update custom.record r set data = case when s.slug is null then r.data - 'slug' else jsonb_set(r.data, '{slug}', to_jsonb(s.slug)) end
  from context.scopes s where s.id = r.id and r.data_class = 'record' and r.data ->> 'slug' is distinct from s.slug;
update custom.record f set created_by = i.created_by
  from context.context_items i where i.id = f.id and f.data_class = 'field' and f.created_by is distinct from i.created_by;
update custom.record t set created_by = s.created_by
  from context.scope_types s where s.id = t.id and t.data_class = 'table' and t.created_by is distinct from s.created_by;
update custom.record f set deleted_at = i.deleted_at
  from context.context_items i where i.id = f.id and f.data_class = 'field' and (f.deleted_at is null) <> (i.deleted_at is null);
update custom.record f set data = jsonb_set(f.data, '{key}', to_jsonb(i.key))
  from context.context_items i where i.id = f.id and f.data_class = 'field' and f.data ->> 'key' is distinct from i.key;
set local session_replication_role = origin;
-- F6 (clone only): archived state and names of scopes and scope types, as the older rows say them —
-- peer lanes' suites on the shared clone write the older tables alone (e.g. a scope archived at
-- 21:05Z on 2026-09-29 whose Record is live); production 0 (measured the same day).
set local session_replication_role = replica;
update custom.record r set deleted_at = s.deleted_at
  from context.scopes s where s.id = r.id and r.data_class = 'record' and r.deleted_at is distinct from s.deleted_at;
update custom.record r set data = jsonb_set(r.data, '{name}', to_jsonb(s.name))
  from context.scopes s where s.id = r.id and r.data_class = 'record' and r.data ->> 'name' is distinct from s.name;
update custom.record t set deleted_at = s.deleted_at
  from context.scope_types s where s.id = t.id and t.data_class = 'table' and t.deleted_at is distinct from s.deleted_at;
update custom.record f set deleted_at = i.deleted_at
  from context.context_items i where i.id = f.id and f.data_class = 'field' and f.deleted_at is distinct from i.deleted_at;
set local session_replication_role = origin;
