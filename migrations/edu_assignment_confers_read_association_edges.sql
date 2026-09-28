-- based-on: public.assoc_members_visible(text, uuid[]) 9ecbe9e702475d7ba7f87f90c3944bad51eccf62ccde424f7eb2507a595fe2b7

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ASSIGNMENT-CONFERS-READ REACHES THE ASSOCIATION EDGES, NOT JUST THE ANCHOR ROWS (2026-09-28)
--
-- BUG (found live): a teacher (admin@admin.com) assigned a flashcard deck OWNED BY A DIFFERENT
-- organization than the class's own org. `edu_assignment_confers_read.sql` (2026-07-14) already
-- makes `iam.has_access(token,id,'viewer')` return true for the deck (`fc_set`) and every one of
-- its cards (`fc_card`, via its parent-deck edge) for an active class member — regardless of which
-- organization owns the deck or which organization the student has active. That is correct, and it
-- is why `fc_set` and `fc_card` rows resolved fine (proven live, rolled-back JWT impersonation as
-- test@test.com: fc_set 1/1, fc_card 4/4, fc_detail 2/2).
--
-- But the study session does not read cards by scanning `fc_card` — it reads the card-MEMBERSHIP
-- EDGES (`platform.associations_live`, source=fc_card, target=fc_set, role='member') through
-- `public.assoc_members_visible`, then reads each `fc_card` by the id the edge names
-- (`features/flashcards/data/fcService.ts` → `associationsService.listForTargetsVisible`). DD-205
-- (2026-09-14) made every association door require the EDGE'S OWN organization to be readable
-- (`iam.org_readable(a.organization_id, a.source_type)`) IN ADDITION TO both ends being readable —
-- correct in general (an edge is metadata about a relationship, and DD-205 closed a real leak where
-- an org member saw edges regardless of either end's own lane). The edge here is filed under the
-- DECK's organization, and a student who is not a MEMBER of that organization fails
-- `iam.org_readable` even though the two rows the edge relates (`fc_set`, `fc_card`) are both
-- independently readable to them via the assignment grant. Zero edges come back, so
-- `getSetWithCards` returns `cards: []`, and the study session shows "No cards to study" — access
-- silently depending on which organization the student belongs to / has active, which the access
-- ladder forbids ("access NEVER depends on the active org"; "locking people out is a bug",
-- common-docs/policies/access-ladder.md, Arman 2026-09-26).
--
-- FIX: the same assignment-confers-read grant that already covers both endpoints now also covers
-- the EDGE'S org-tenancy gate, for edges targeting the assigned resource. `assignment_conferred`
-- evaluates `public._edu_can_read_via_assignment(p_target_type, tid)` once per distinct target
-- (mirrors the existing `viewable` CTE's shape/cost), and the edge is admitted when
-- `iam.org_readable(...)` OR the target is assignment-covered. This is additive and narrow: a plain
-- org member with no assignment grant is completely unaffected (still needs `iam.org_readable`);
-- `iam.assoc_side_readable(a.source_type, a.source_id)` — DD-195's per-edge "may I read the row this
-- edge reveals" check — is untouched, so a card that is somehow NOT independently readable still
-- can't leak through the edge. Self-revoking exactly like the underlying grant: unassign or leave
-- the class and the edge (and the card it names) stop resolving, live-evaluated, nothing to clean up.
--
-- Also checked (no fix needed): quizzes/assessments never route through association edges for their
-- item read — `assessment_item` is read directly by `assessment_id` and gated by
-- `iam.accessible_entity_ids('assessment', …)`, which already resolves through
-- `has_access_for_base` → the same `_edu_can_read_via_assignment` branch. A cross-org quiz
-- assignment was proven live in this same session (see FEATURE.md change log).
--
-- APPLIED WITH: pnpm db:apply migrations/edu_assignment_confers_read_association_edges.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.assoc_members_visible(
  p_target_type text,
  p_target_ids  uuid[]
)
returns table(
  id              uuid,
  target_id       uuid,
  source_type     text,
  source_id       uuid,
  role            text,
  label           text,
  "position"      integer,
  metadata        jsonb,
  organization_id uuid,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with viewable as materialized (
    -- DD-205: may the caller read the anchor (target) they named? Once per distinct target.
    select tid
      from unnest(coalesce(p_target_ids, '{}'::uuid[])) as tid
     where iam.assoc_side_readable(p_target_type, tid)
  ),
  assignment_conferred as materialized (
    -- Assignment-confers-read reaches the EDGE, not just the endpoints (2026-09-28): a class
    -- assignment grants a member the whole deck/quiz regardless of organization. Evaluated once per
    -- distinct target, same shape/cost as `viewable`.
    select tid
      from unnest(coalesce(p_target_ids, '{}'::uuid[])) as tid
     where public._edu_can_read_via_assignment(p_target_type, tid)
  )
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label,
         a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type
     and a.target_id in (select tid from viewable)                   -- DD-205: the anchor the caller named
     and (
       iam.org_readable(a.organization_id, a.source_type)            -- DD-205: the EDGE's own tenancy, unchanged
       or a.target_id in (select tid from assignment_conferred)      -- NEW: assignment-confers-read reaches the edge
     )
     and iam.assoc_side_readable(a.source_type, a.source_id)         -- DD-195: AND the row it reveals, unchanged
  order by 7 nulls last, 10;
$function$;

-- No REVOKE/GRANT here: CREATE OR REPLACE FUNCTION preserves the function's existing ACL
-- (authenticated + service_role only, set by the DD-205 migration this replaces) unchanged.

update platform.client_callable_door d
   set reason = 'Association membership reader — the members of many containers in one round-trip (@ai-matrx/associations '
                'listMembersVisible). The client holds no grant on platform.associations. SIGNED-IN only. DD-205 (2026-09-14): '
                'BOTH ENDS are gated. (1) THE ANCHOR containers the caller named — iam.assoc_side_readable, once per distinct '
                'id. (2) THE ROW EACH EDGE REVEALS, the member — iam.assoc_side_readable, per edge. (3) THE EDGE''S OWN '
                'ORGANIZATION — iam.org_readable, OR the target is covered by an active education class assignment grant '
                '(2026-09-28: assignment-confers-read reaches the edge itself, not just the endpoints, so an assigned deck''s '
                'card-membership edges resolve regardless of which organization owns the deck).',
       gate_predicate = 'iam.assoc_side_readable'
 where d.schema_name = 'public' and d.function_name = 'assoc_members_visible';
