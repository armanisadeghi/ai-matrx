-- target: branch
-- additive: no
--
-- W1-REL — THE TWO CLOSED SETS, SPLIT OUT OF `w1_rel_a_relation_is_an_association.sql`.
--
-- WHY THIS FILE EXISTS, SAID PLAINLY RATHER THAN LEFT AS A SHRUG
-- --------------------------------------------------------------
-- These two statements declare the record->record association type and the `relation_snapshot`
-- payload kind. They are REGISTRY DECLARATIONS in every sense that matters: `platform.
-- association_types` and `platform.edge_payload_kind` are live closed-set tables that
-- `platform.validate_edge_payload()` and the association trigger READ, exactly like
-- `platform.entity_types`.
--
-- But the runner's additive allow-list (`scripts/lib/migration-target.ts`, and its Python twin
-- in aidream, judged against `migrations/judgment-corpus/` by `pnpm check:migration-judgment`)
-- names eight registry tables and these two are not among them:
--   platform.feature_knob, platform.knob_override, platform.knob_rung_lock,
--   platform.entity_types, platform.entity_relationships, platform.client_callable_door,
--   campaign_watch.build_lock, campaign_watch.go_signal_capture
-- So a file that names production cannot carry them, and the whole of
-- `w1_rel_a_relation_is_an_association.sql` was being refused for these two lines alone.
--
-- 🚨 THE REAL FIX, WHICH THIS LANE DID NOT MAKE AND SAYS SO: add `platform.association_types`
-- and `platform.edge_payload_kind` to that list in BOTH runners, add a fixture for each to the
-- judgment corpus, and write them into `migrations/JUDGMENT.md` — which is the ONE judgement
-- and is gated in CI and in both release scripts. Changing the judge is not a relation lane's
-- call to make alone, and a lane that quietly widened it would be doing exactly what the
-- allow-list exists to stop. Until that lands, W1-REL's closed sets reach the main database
-- through this file as an attended step.

set lock_timeout = '2s';

insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, allows_loops, notes)
values ('record', 'record', null, 'none', 'editor', true, true,
        'W1-REL / REL-10: a custom-data relation, one row per edge, role = the field key. Direction is source = the relating record, target = the related record; the pair is symmetric so trg_associations_auto_orient has nothing to flip. allows_loops is true HERE because REL-5 makes loops a per-relation word on the Field, refused by platform.enforce_relation_edge when the declaration says refused.')
on conflict (source_type, target_type) do nothing;

insert into platform.edge_payload_kind (kind, source_type, target_type, version, description, json_schema)
values ('relation_snapshot', null, null, 1,
        'W1-REL / REL-3: a snapshot binding freezes a COPY of the target''s values in the relation''s own payload at write time. It is not a pointer into History and carries no version and no row_version id to resolve against - that is the difference REL-3 names, and the schema is what makes it unrepresentable to smuggle one in under another key.',
        '{"type":"object","required":["taken_at","values"],"properties":{"taken_at":{"type":"string"},"values":{"type":"object"},"title":{"type":["string","null"]},"table_id":{"type":["string","null"]}},"additionalProperties":true}'::jsonb)
on conflict (kind) do nothing;
