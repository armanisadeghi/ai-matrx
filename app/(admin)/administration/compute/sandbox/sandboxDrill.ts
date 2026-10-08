import type { MatrxDataTableLocalDrillConfig } from "@ai-matrx/design-system/data-table";

/**
 * LEVELS of the sandbox instances. A status asks who holds that state and why it ended; a tier,
 * how its instances are doing and how long they were given; a stop reason, which tier and
 * status it hit. Time comes last. The owner is an account id, so it is counted ("Owners"),
 * never offered as a thing to group by. Stop, SSH and delete stay on the rows.
 */
export const SANDBOX_DRILL: MatrxDataTableLocalDrillConfig = {
  local: true,
  countLabel: "Sandboxes",
  dimensions: ["status", "tier", "stop_reason", "created_at"],
  measures: ["count", "owners", "avg_ttl_seconds", "max_ttl_seconds"],
  extraDimensions: [
    { key: "status", label: "Status", kind: "choice", cardinality: "low" },
    { key: "tier", label: "Tier", kind: "choice", cardinality: "low" },
    { key: "stop_reason", label: "Stop reason", kind: "choice", cardinality: "low" },
  ],
  extraMeasures: [
    { key: "owners", label: "Owners", additive: false, op: "count_distinct", of: "user_id" },
  ],
  levels: {
    status: {
      breakouts: ["tier", "stop_reason", "created_at:day"],
      attributes: [],
      show: ["count", "owners", "avg_ttl_seconds"],
    },
    tier: {
      breakouts: ["status", "stop_reason", "created_at:day"],
      attributes: [],
      show: ["count", "owners", "avg_ttl_seconds", "max_ttl_seconds"],
    },
    stop_reason: {
      breakouts: ["status", "tier", "created_at:day"],
      attributes: [],
      show: ["count", "owners"],
    },
  },
};
