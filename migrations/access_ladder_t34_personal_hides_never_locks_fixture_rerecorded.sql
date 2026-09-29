-- lane: access-ladder T-34 — the kernel equivalence fixture's 47 "gained" answers are the law, re-recorded.
-- based-on: platform.kernel_equivalence_expected() 495f5c155ff3cbe9b7c2bba7fabcbe5096cea12f314244d90c2ffb05100e1d66
--
-- platform.kernel_equivalence_check() reported ok=false, lost 0, missing 0, gained 47 (31 kernel, 8 policy,
-- 8 set answers). Every gained answer is one question: a coworker in the record's organization (the fixture's
-- `member` Keiko Tran or `org_owner` Owen Pruitt) opening a row whose `visibility` is 'personal' on an
-- Organization-class table — code_repository repo_personal / repo_personal_shared_viewer, interview_session
-- session_personal / session_personal_shared_commenter — or the comment on the shared personal repo (a child,
-- opens with its parent). Each now answers exactly as its 'internal' twin already did (member viewer/commenter/
-- editor, owner up to admin; a comment's non-author never editor).
--
-- Cause: access_ladder_t11j_personal_stops_locking_on_organization_tables.sql (matrx-frontend a66b6acc35,
-- 2026-09-27 18:04 PT) — the org-member and org-admin lanes of iam.has_access_for_base, iam.accessible_entity_ids
-- and iam.entity_read_expr (policy text) stopped treating 'personal' as a lock on Organization tables; it replaced
-- kernel bodies and re-recorded the fingerprint but left this fixture's answers at their pre-T-11 values. That is
-- why the drift was already on the day-old clone. T-33, T-35 and T-11y re-recorded with the same 47 still standing
-- (each asserted "no lost/missing" and "identical before/after", never "no gained").
--
-- Verdict: follows the law (common-docs/policies/access-ladder.md — Organization: "every member of the
-- organization that owns the record" opens it; the per-item choice hides in lists, it does not lock).
-- Real seat: test@test.com, a member of admin@admin.com's organization 884d1ce8…, opens all 47 of admin's
-- 'personal' interview sessions through the kernel and through RLS (rolled-back probe, 2026-09-28).
--
-- This file patches ONLY those 47 keys (it refuses if the gained set is anything else, or anything is lost or
-- missing), changes no kernel body (fingerprint unchanged, asserted), and writes one
-- platform.kernel_fingerprint_record row with the ruling.

do $t34$
declare
  v_live   jsonb := platform.kernel_equivalence_answers();
  v_exp    jsonb := platform.kernel_equivalence_expected();
  v_fp     text  := iam.entity_read_kernel_fingerprint();
  v_gained text[];
  v_other  text[];
  v_new    jsonb;
  v_chk    jsonb;
  c_shape  constant text :=
    '^[kps]:(code_repository:(repo_personal|repo_personal_shared_viewer)|interview_session:(session_personal|session_personal_shared_commenter)|comment:comment_on_shared_personal_repo):(member|org_owner)(:(viewer|commenter|editor|admin))?$';
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  if v_live->>'error' is not null then
    raise exception 't34: the fixture errors: %', v_live->>'error';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 't34: the kernel fingerprint has drifted from its recording; this file re-records answers only.';
  end if;

  select coalesce(array_agg(k order by k), '{}') into v_gained
    from jsonb_object_keys(v_exp->'answers') k
   where (v_exp->'answers'->>k)::boolean is false and (v_live->'answers'->>k)::boolean is true;
  select coalesce(array_agg(k order by k), '{}') into v_other
    from (select jsonb_object_keys(v_exp->'answers') k union select jsonb_object_keys(v_live->'answers')) s
   where (v_exp->'answers'->k) is distinct from (v_live->'answers'->k) and not (k = any (v_gained));
  if cardinality(v_other) > 0 then
    raise exception 't34: answers moved other than false->true gains (lost/missing/null): %', v_other;
  end if;
  if cardinality(v_gained) <> 47 or exists (select 1 from unnest(v_gained) k where k !~ c_shape) then
    raise exception 't34: the gained set is not the 47 personal-on-Organization answers reviewed: % (%)',
      cardinality(v_gained), (select array_agg(k) from unnest(v_gained) k where k !~ c_shape);
  end if;

  v_new := jsonb_set(v_exp, '{answers}',
             ((v_exp->'answers') - v_gained)
             || (select jsonb_object_agg(k, v_live->'answers'->k) from unnest(v_gained) k));
  execute format('CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE AS %L',
                 E'\n  SELECT ' || quote_literal(v_new::text) || E'::jsonb\n');

  v_chk := platform.kernel_equivalence_check();
  if not (v_chk->>'ok')::boolean then
    raise exception 't34: the check is still not ok after the re-record: %', v_chk - 'read_lane';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from v_fp then
    raise exception 't34: a kernel body moved during this file.';
  end if;

  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_fp, v_fp, '{}'::text[],
          'ACCESS LADDER T-34: 47 fixture answers re-recorded as intended. A coworker opens a ''personal'' row of an '
          || 'Organization-class table (code_repository, interview_session) and a comment on it, exactly as its internal '
          || 'twin — the per-item choice hides in lists, never locks (common-docs/policies/access-ladder.md). Moved by '
          || 'access_ladder_t11j (matrx-frontend a66b6acc35, 2026-09-27), which left the fixture unrecorded.',
          v_live->>'version',
          jsonb_build_object('gained_rerecorded', to_jsonb(v_gained), 'count', cardinality(v_gained),
                             'cause', 'access_ladder_t11j_personal_stops_locking_on_organization_tables',
                             'check_after', v_chk - 'read_lane'),
          'migration / access_ladder_t34', 'platform.kernel_equivalence_expected');
end
$t34$;
