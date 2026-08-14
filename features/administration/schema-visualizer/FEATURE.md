# Schema visualizer

The visualizer consumes `/api/schema-overview` and renders database relations and their foreign-key edges. Relation identity is always the exact `schema.table` string in response-object keys, node IDs, selected-element IDs, relationship targets, and junction-table references. Physical `table_name` alone is display metadata, never a map/cache key.

The current endpoint inventories the `public` schema, but its key shape is intentionally schema-aware so expanding the inventory cannot merge same-named relations.

## Change log

- 2026-08-13 — D158: qualified every relation key and relationship endpoint; removed bare-name maps from the API assembly path.
