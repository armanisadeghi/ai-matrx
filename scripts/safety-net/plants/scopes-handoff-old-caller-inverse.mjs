// Lane SN-SCOPES (2026-10-01): the ruled default broken (CVN-2's inverse is refused by the T-13 row-column guard, so the knob
// the suite asserts is emptied instead), inside the suite's own rolled-back transaction, for
// scopes.sql-handoff-old-caller proves, executed inside the suite's own rolled-back transaction. S10 must go RED.
export default {
  id: "scopes-handoff-old-caller-inverse",
  check: "scopes.sql-handoff-old-caller",
  items: ['S10'],
  description: "the platform's default System items are emptied: an old four-argument caller is handed none",
  mode: "in-transaction",
  apply: "update platform.feature_knob set value = '[]'::jsonb, default_value = '[]'::jsonb where feature = 'context' and key = 'system_item_defaults';",
};
