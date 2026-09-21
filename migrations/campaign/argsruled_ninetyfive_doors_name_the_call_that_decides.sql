-- lane: ARGS-RULED
--
-- chair-step: it UPDATEs an existing registry column (platform.client_callable_door.argument_rules)
--   on 95 rows rather than inserting new ones, which the additive allow-list refuses by name. It
--   MERGES per argument — an argument this lane did not read keeps whatever it already carried —
--   so nothing another lane declared is thrown away. No body changes, no row of anybody's data is
--   touched. The inverse is
--   migrations/inverse/argsruled_ninetyfive_doors_name_the_call_that_decides_down.sql.
--
-- ARGS-RULED — 95 DOORS WHOSE EVERY ID ARGUMENT IS DECIDED, AND THE CALL THAT DECIDES IT.
--
-- 194 id arguments. Each ruling names, from THAT door's own body: the ladder primitive it is
-- passed to, the ARGUMENT POSITION it stands at inside that call, and the fact that the call
-- stands before every other use of the argument in the body. Those three together are the
-- reading — a name in a body is not a check, an id in the wrong position of the right call is
-- not a check, and a check after the read is not a check.
--
-- THE POSITIONS ARE THE WHOLE POINT, so they are written here as well as in the rows:
--   custom.assert_client_may_reach(ORG, door)                        arg1 = organization
--   custom.assert_client_may_open (ORG, RECORD, door, level, word)   arg1 = organization, arg2 = record
--   custom.assert_client_may_change(ORG, RECORD, door, level, word)  arg1 = organization, arg2 = record
--   custom.assert_may_know_table  (ORG, TABLE, door)                 arg1 = organization, arg2 = Table
--   custom.has_visibility (user, type, RECORD, level)                arg3 = record
--   custom.effective_level(user, ORG, RECORD, type)                  arg2 = organization, arg3 = record
--   iam.has_org_access(ORG) · iam.has_access(type, ID, level) · iam.may_address_user_in_org(PERSON, ORG)
--
-- AND WHAT IS NOT ON THAT LIST IS NOT A CHECK. `custom.assert_store_door` and
-- `platform.assert_relations_door` decide a PRODUCT SWITCH and the role that owns the store, and
-- no membership at all — an argument whose only company is one of those is UNRULED here and is
-- read by hand in the waves that follow. The same goes for a plain `is null` guard.
--
-- Seven arguments in this set have a use of the argument BEFORE the ladder call and were read one
-- at a time rather than machine-cleared: `custom.comment_thread(p_record_id)` (decided inside
-- `custom.io_comments`, which asks `has_visibility` and returns empty), `custom.io_export_csv(
-- p_organization_id)` (decided in the DECLARE initializer by `custom.io_export`, whose first two
-- lines are the wall and the Table), `custom.dashboard_declare(p_table_id)` and
-- `custom.work_slots_declare(p_home_id)` (a null guard), `custom.dashboard_delete(p_dashboard_id)`
-- and `custom.record_table(p_record_id)` (an existence check scoped to the organization that
-- answers 02000 identically for a foreign id and an invented one, by its own hint), and
-- `custom.portal_principal_bind(p_organization_id)` (the principal row is read before the wall;
-- that is an existence oracle of one bit and it belongs to lane PORTAL-BIND, which owns that door).

set lock_timeout = '4s';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'agg_explain';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'anon_submissions';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'applicable_fields';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'bookings';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_template_id": {"type": "uuid", "position": 3, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'checklist_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_step_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'checklist_step_complete';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_step_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'checklist_step_refusal';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_template_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'checklist_template_shape';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'choice_census';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.has_visibility(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"note": "the door''s own refusal on that ladder; a foreign id and an invented one take the same branch", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'comment_thread';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'computed_provenance';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_conversation_id": {"type": "uuid", "position": 2, "check": "this body decides it with iam.has_access(arg2) \u2014 the platform access kernel for this entity token, and that call stands before every other use of this argument in the body.", "foreign": {"note": "the door''s own refusal on that ladder; a foreign id and an invented one take the same branch", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 3, "entity": "custom_record", "check": "this body decides it with custom.has_visibility(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"note": "the door''s own refusal on that ladder; a foreign id and an invented one take the same branch", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'conversation_scope_bind';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_conversation_id": {"type": "uuid", "position": 2, "check": "this body decides it with iam.has_access(arg2) \u2014 the platform access kernel for this entity token, and that call stands before every other use of this argument in the body.", "foreign": {"note": "the door''s own refusal on that ladder; a foreign id and an invented one take the same branch", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'conversation_scope_unbind';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_dashboard_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'dashboard_delete';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'dashboard_stuck';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'delete_preview';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'doc_renders';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'doc_signatures';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_template_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'doc_template_read';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'doc_templates';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'enrich_pin';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'enrichments';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'field_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_field_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'field_dependants';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 3, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'history_prune';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'history_retention';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'history_retention_set';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'inbound_addresses';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'inbound_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'io_export';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'io_import_begin';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'io_import_open';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'io_import_plan';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'io_imports';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'io_infer_column';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_choice_keys';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_delete';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_demote';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_loser_id": {"type": "uuid", "position": 3, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_winner_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_merge';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_promote';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_purge';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_rename';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_parent_id": {"type": "uuid", "position": 3, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_reparent';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_retype';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrate_split';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_target_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'migrations';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2), custom.effective_level(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'my_level';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'pipeline_board';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'pipeline_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'pipeline_gate_preview';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'pipeline_pending';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'pipeline_read';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2), custom.effective_level(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'pipeline_transition_refusal';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.has_visibility(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"note": "the door''s own refusal on that ladder; a foreign id and an invented one take the same branch", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'promote_table';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'query_by_coordinates';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'query_table_homes';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_may_know_table(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2), custom.effective_level(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist; the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'read_records';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_aggregate';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_as_of';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_delete';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_history';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_restore';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_restore_preview';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_stage_pending';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.has_visibility(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"note": "the door''s own refusal on that ladder; a foreign id and an invented one take the same branch", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_table';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_update';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_values_versioned';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'record_write';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_container_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_item_id": {"type": "uuid", "position": 3, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'relation_carry';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'relation_target_card';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'relation_targets';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_subject_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2), custom.has_visibility(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'share_access';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_subject_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'share_lane_set';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_subject_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2), custom.effective_level(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'share_people';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'sign_requests';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'subscription_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'table_capacity';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2), custom.effective_level(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'table_share_outside';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1), custom.effective_level(arg2) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2), custom.effective_level(arg3) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'table_share_outside_invite';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'table_stage_field';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'table_type_field';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'value_read';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'view_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_has_assignment';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_instantiation_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_instantiation_shape';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_record_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_record_states';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_slot_expire';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_slot_hold';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_slot_holds';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_hold_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_slot_release';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_home_id": {"type": "uuid", "position": 4, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_slots_declare';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_change(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_take_assignment';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_open(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_template_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_template_instantiate';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_open(arg1), custom.assert_client_may_reach(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_template_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_client_may_open(arg2) \u2014 the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_template_shape';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_ninetyfive_doors_name_the_call_that_decides.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb,
         '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k,
                        coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 1, "entity": "organization", "check": "this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) \u2014 the organization wall \u2014 a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}, "p_table_id": {"type": "uuid", "position": 2, "entity": "custom_record", "check": "this body decides it with custom.assert_may_know_table(arg2) \u2014 the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body: the ladder call, its argument position, and that it precedes every other use of the argument"}}'::jsonb) as t(k, v)),
         true)
 where d.schema_name = 'custom' and d.function_name = 'work_whose_turn';
