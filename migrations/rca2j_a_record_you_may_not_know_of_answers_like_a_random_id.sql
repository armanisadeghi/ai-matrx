-- based-on: public.access_denied_context(text, uuid) cf9d383d892bf722115a8eaba4b0fe4f6a5688c9a5bc99392d33fd150fcd986f
--
-- RC-A2 round 4 (register row RC-A2). A RECORD YOU MAY NOT KNOW OF ANSWERS EXACTLY LIKE A RANDOM ID.
--
-- The hole: public.access_denied_context — the "You don't have access" screen's one question —
-- gave the FULL answer (exists, title, owner, organization, deletion, prior request) to anybody in
-- the organization that holds the record, even when the record is hidden from them. test@test.com,
-- a member of a shared organization, opening admin@admin.com's PERSONAL task read its title and its
-- owner. Census 2026-09-26 (read-only, ids only): 178 record types have rows in test@test.com's 27
-- organizations that test@test.com can neither open nor discover; every one of them answered
-- `exists: true` with the title and the owner (the "member of the object's organization keeps the
-- full answer" exception of the V24 stranger rule).
--
-- The rule (the platform's no-enumeration rule, the one iam.is_discoverable already states): a
-- signed-in person with no level on a row, who does not own it and may not DISCOVER it, is told
-- exactly what a random id tells her — no existence, no title, no owner, no organization, no
-- deletion, no prior request, no ancestor. Google Drive's "You need access" page for a file you
-- were never shared on is the reference: it names nothing. Two keep the full answer:
--   * whoever may discover the row (iam.is_discoverable: the owner's org-mates on an INTERNAL row,
--     a grantee, a container member, the org admin lane on an internal row, ...);
--   * an owner/admin of the organization that holds it (the org's own oversight — the Table
--     transfer offer, features/sharing/components/TableTransferOffer.tsx, is exactly that).
-- The V24 stranger rule is kept as it was (it is the same answer for people outside the org).
-- And a DETAIL (a comment) on such a record is a random id too: its own token, no `via` — `via`
-- would say "a comment with this id exists on something".
-- Forcing suite: aidream db/tests/test_rca2j_a_record_you_may_not_know_of_answers_like_a_random_id.py.
-- Inverse (rehearsal only): migrations/inverse/rca2j_a_record_you_may_not_know_of_answers_like_a_random_id_down.sql

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  v_def := pg_get_functiondef('public.access_denied_context(text,uuid)'::regprocedure);
  for r in
    select * from (values
      -- 1. a detail on a record the caller may not know of answers as a random detail id
      (1, 1,
       $a$    return public.access_denied_context(v_parent_type, v_parent_id)
           || jsonb_build_object('via', jsonb_build_object('token', v_meta.token));
$a$,
       $a$    v_entity_json := public.access_denied_context(v_parent_type, v_parent_id);
    -- RC-A2j: a detail on a record the caller may not know of is a random id — its own token, no
    -- `via` (which would say "a comment with this id exists on something").
    if v_entity_json ->> 'exists' = 'false' then
      return jsonb_build_object(
        'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
        'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label));
    end if;
    return v_entity_json || jsonb_build_object('via', jsonb_build_object('token', v_meta.token));
$a$),
      -- 2. the hidden record's answer is the missing answer, org membership or not
      (2, 1,
       $a$  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and v_ancestor_json is null
     and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)) then
$a$,
       $a$  -- RC-A2j: THE HIDDEN RECORD'S ANSWER IS THE MISSING ANSWER — for a member of its organization
  -- too. Only whoever may discover the row, or an owner/admin of the organization holding it (the
  -- org's own oversight: the Table transfer offer), keeps the full answer.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and (
           (v_ancestor_json is null
            and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)))
        or not (iam.is_discoverable(v_uid, v_meta.token, p_id, 'viewer'::public.permission_level)
                or (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)))
         ) then
$a$)
    ) as t(ord, expected, anchor, repl)
    order by ord
  loop
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca2j patch %: anchor occurs % time(s) in public.access_denied_context, expected % — nothing was changed', r.ord, v_n, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
