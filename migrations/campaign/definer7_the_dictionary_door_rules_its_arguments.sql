-- chair-step: one UPDATE on our own door register. NON-ADDITIVE BY CONSTRUCTION and therefore
--   header-less on the additive allow-list. Nothing is created, dropped or granted, no function
--   body is touched, and no row of anybody's data is read, written or moved. Its inverse is
--   `migrations/inverse/definer7_the_dictionary_door_rules_its_arguments_down.sql`.
-- lock: platform
-- lane: DEFINER-7
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- DEFINER-7 — THE DOOR THIS LANE FIXED NOW SAYS WHAT EACH OF ITS IDS IS CHECKED AGAINST.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- `definer7_seven_client_doors_decide_or_stop_being_doors.sql` made `public.dict_resolve` reach
-- an access decision. That is what puts a door into the SECOND census beside the body lint —
-- `platform.definer_two_id_population()`, lesson 41 — which asks a harder question: not "does
-- this body decide anything", but "does its door row say, PER ARGUMENT, what that argument is
-- checked against". A door that answers the first and not the second is exactly the
-- map_diagnostics class: it checks its first id and reads straight through its second.
--
-- `dict_resolve` takes three id arrays and the answer is the same for all three, because the
-- narrowing is one membership set:
--
--   p_organization_ids  — filtered through `iam.has_org_access(o)` IN THE DOOR ITSELF, before
--                         `public.dict_resolve_for` is called at all.
--   p_scope_type_ids    — `dict_resolve_for` selects `context.scope_types` only where
--                         `st.organization_id in (select org_id from member_orgs)`.
--   p_scope_ids         — the same, for `context.scopes`.
--
-- `member_orgs` is `iam.organization_member where user_id = p_user_id`, and `p_user_id` is
-- `(select auth.uid())` — the caller, never an argument. So an id the caller has no membership
-- behind contributes NOTHING to the merge, and contributes nothing in exactly the way an
-- invented uuid does: no raise, no different row count, no different `source_count`. That is
-- the shape this class wants — decided before existence, so a foreign id and an invented one
-- answer identically — and `scripts/campaign-tests/definer7_green.sql` clause 4 executes it
-- rather than asserting it: it compares the whole `dict_resolve` answer for a real
-- organization the seat does not belong to against the answer for `gen_random_uuid()` and
-- raises if they differ by one byte.
--
-- These are `uuid[]` arguments, so `p_include_user` and `p_all` are not ids and are not ruled
-- here; `p_all` is noted on each rule because it is the one flag that changes what the arrays
-- mean (with `p_all` true the arrays are ignored entirely and every membership of the caller's
-- own is merged — which is narrower than the arrays can ever be, never wider).

update platform.client_callable_door
   set argument_rules = jsonb_build_object(
         'version', 1,
         'declared_by', 'definer7_the_dictionary_door_rules_its_arguments.sql',
         'arguments', jsonb_build_object(
           'p_organization_ids', jsonb_build_object(
             'type', 'uuid[]', 'position', 3, 'optional', true,
             'entity', 'organization',
             'access', 'membership, decided in the door before the read',
             'check', 'iam.has_org_access(o) for every element, in public.dict_resolve itself, before public.dict_resolve_for is called',
             'verified', 'live 2026-09-22 from a member seat (scripts/campaign-tests/definer7_green.sql clause 4)',
             'null_rule', jsonb_build_object('default', '{}'),
             'foreign', jsonb_build_object(
               'not_a_leak', true,
               'same_as_invented', true,
               'note', 'An organization the caller is not a member of is dropped by iam.has_org_access before the read, and the whole answer is byte-identical to the answer for an invented uuid. With p_all true the array is ignored and only the caller''s own memberships are merged.')),
           'p_scope_type_ids', jsonb_build_object(
             'type', 'uuid[]', 'position', 4, 'optional', true,
             'entity', 'context_scope_type',
             'access', 'membership of the owning organization',
             'check', 'public.dict_resolve_for selects context.scope_types only where st.organization_id is one of the caller''s iam.organization_member rows',
             'verified', 'static reading of public.dict_resolve_for 2026-09-22',
             'null_rule', jsonb_build_object('default', '{}'),
             'foreign', jsonb_build_object(
               'not_a_leak', true,
               'same_as_invented', true,
               'note', 'A scope type belonging to an organization the caller is not a member of contributes no entry and no source, exactly as an invented uuid does — the join to member_orgs is the filter, so there is no arm that can answer differently.')),
           'p_scope_ids', jsonb_build_object(
             'type', 'uuid[]', 'position', 5, 'optional', true,
             'entity', 'context_scope',
             'access', 'membership of the owning organization',
             'check', 'public.dict_resolve_for selects context.scopes only where sc.organization_id is one of the caller''s iam.organization_member rows',
             'verified', 'static reading of public.dict_resolve_for 2026-09-22',
             'null_rule', jsonb_build_object('default', '{}'),
             'foreign', jsonb_build_object(
               'not_a_leak', true,
               'same_as_invented', true,
               'note', 'Same membership join as p_scope_type_ids: a scope outside the caller''s organizations contributes nothing and is indistinguishable from an id that was never real.'))))
 where schema_name = 'public'
   and function_name = 'dict_resolve';
