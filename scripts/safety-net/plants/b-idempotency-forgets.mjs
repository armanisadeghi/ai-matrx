// SAFETY-NET-B · A10. The table API keeps an Idempotency-Key's first answer for 0 hours (knob), so a retried create is
// run again instead of replayed. A10 "*.rest.idempotent_replay" must go RED. Platform-wide on the clone, one probe run.
export default {
  id: "b-idempotency-forgets",
  check: "agents.api-mcp",
  items: ["A10"],
  description: "table_api/idempotency_retention_hours = 0 on the clone (24 restored after)",
  mode: "committed",
  apply: `select platform.feature_knob_set('table_api', 'idempotency_retention_hours', '0'::jsonb);`,
  restore: `select platform.feature_knob_set('table_api', 'idempotency_retention_hours', '24'::jsonb);`,
  readback: `select value = '24'::jsonb from platform.feature_knob where feature = 'table_api' and key = 'idempotency_retention_hours';`,
};
