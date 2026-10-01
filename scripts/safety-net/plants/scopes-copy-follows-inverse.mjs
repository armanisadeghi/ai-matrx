// Lane SN-SCOPES (2026-10-01): the follow knob turned off (the real inverse DROPs triggers under ACCESS EXCLUSIVE on
// context.* / custom.record, which would stall every lane on the shared clone), for
// scopes.sql-copy-follows proves, executed inside the suite's own rolled-back transaction. S03, S10 must go RED.
export default {
  id: "scopes-copy-follows-inverse",
  check: "scopes.sql-copy-follows",
  items: ['S03', 'S10'],
  description: "the platform switches the context copy's follow off (custom/context_copy_following = false): an edit no longer tells the copy",
  mode: "in-transaction",
  apply: "update platform.feature_knob set value = 'false'::jsonb, default_value = 'false'::jsonb where feature = 'custom' and key = 'context_copy_following';",
};
