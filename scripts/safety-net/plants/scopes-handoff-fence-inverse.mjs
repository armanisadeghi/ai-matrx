// Lane SN-SCOPES (2026-10-01): the follow knob turned off (the real inverse DROPs triggers under ACCESS EXCLUSIVE on
// context.* / custom.record, which would stall every lane on the shared clone), for
// scopes.sql-handoff-fence proves, executed inside the suite's own rolled-back transaction. S10 must go RED.
export default {
  id: "scopes-handoff-fence-inverse",
  check: "scopes.sql-handoff-fence",
  items: ['S10'],
  description: "the platform switches the context copy's follow off (custom/context_copy_following = false): the copy takes a person's or an agent's writes",
  mode: "in-transaction",
  apply: "update platform.feature_knob set value = 'false'::jsonb, default_value = 'false'::jsonb where feature = 'custom' and key = 'context_copy_following';",
};
