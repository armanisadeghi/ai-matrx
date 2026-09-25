-- lane: DEAD-KEYS — inverse of deadkeys_feature_knob_has_no_signed_out_reader.sql
-- chair-step: re-creates a policy and re-issues a grant by construction. It restores the EXACT
-- three-column ACL and the exact predicate the table held on 2026-09-22, read live before the
-- withdrawal and written out here rather than inferred.
set local lock_timeout = '2s';

create policy feature_knob_read_anon on platform.feature_knob
  for select to anon using (public_read);

grant select (feature, key, value) on platform.feature_knob to anon;

update platform.entity_types
   set anon_lane_pending_withdrawal_reason =
     'platform.feature_knob''s hand-written anonymous lane is restored by the inverse of lane DEAD-KEYS'' withdrawal file; the ruling that it has no signed-out reader stands in migrations/campaign/deadkeys_feature_knob_has_no_signed_out_reader.sql.'
 where schema_name = 'platform' and table_name = 'feature_knob';
