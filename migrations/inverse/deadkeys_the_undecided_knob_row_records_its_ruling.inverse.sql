-- lane: DEAD-KEYS — inverse: restores ANON-LANES' original wording verbatim.
-- chair-step: a plain UPDATE, non-additive only in that it puts an older sentence back.
set local lock_timeout = '2s';

update platform.entity_types
   set anon_lane_pending_withdrawal_reason =
     'platform.feature_knob serves client feature gating that has to resolve BEFORE sign-in: DD-230 measured 194 anonymous 200s in 24 h, every one of them select=feature,key,value. Its lane is the hand-written policy feature_knob_read_anon gated on a `public_read` boolean, on a `private`-class `system` table -- not the visibility-gated pub_read shape iam._apply_rls_unchecked emits for the opt-in -- so declaring the opt-in here would be the wrong shape and reclassifying the table would be a much larger ruling. Owner: lane ANON-LANES hands this one on undecided rather than guessing. 2026-09-21.'
 where schema_name = 'platform' and table_name = 'feature_knob';
