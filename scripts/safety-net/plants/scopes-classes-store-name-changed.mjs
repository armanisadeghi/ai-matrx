// Lane SN-SCOPES (2026-10-01): one class's store copy says another name than its old row — "World
// Literature" becomes "World Lit" in custom.record only, inside the suite's rolled-back transaction.
// The checkout reader (S15) and edu_class_state (S16) then disagree with the old row: both must go RED
// on World Literature (027fbb4e…) in the suite's message.
export default {
  id: "scopes-classes-store-name-changed",
  check: "scopes.sql-classes-through-the-switch",
  items: ["S15", "S16"],
  description: "World Literature's store Record renamed \"World Lit\" (old row untouched)",
  mode: "in-transaction",
  apply: "update custom.record set data = jsonb_set(data, '{name}', '\"World Lit\"') where id = '027fbb4e-ad14-4c35-b015-d62f4d532372';",
};
