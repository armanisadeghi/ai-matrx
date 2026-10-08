import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillDroppedItems,
  drillLevelProblems,
  emptyDrillQuestion,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { SANDBOX_DRILL } from "./sandboxDrill";

const s = (o: Record<string, unknown>) => ({
  user_id: "u1",
  status: "running",
  tier: "ec2",
  stop_reason: null,
  ttl_seconds: 3600,
  created_at: "2026-10-06T10:00:00Z",
  ...o,
});
const rows = [
  s({}),
  s({ user_id: "u2" }),
  s({ status: "stopped", stop_reason: "ttl_expired", ttl_seconds: 600, created_at: "2026-10-05T10:00:00Z" }),
  s({ status: "failed", tier: "hosted", stop_reason: "boot_error", created_at: "2026-10-05T12:00:00Z" }),
];
// The ids the page's own columns carry.
const columns = [
  { id: "user_id", accessorKey: "user_id", header: "user_id" },
  { id: "status", accessorKey: "status", header: "status" },
  { id: "tier", accessorKey: "tier", header: "tier" },
  { id: "stop_reason", accessorKey: "stop_reason", header: "stop_reason" },
  { id: "ttl_seconds", accessorKey: "ttl_seconds", header: "ttl_seconds" },
  { id: "created_at", accessorKey: "created_at", header: "created_at" },
] as MatrxColumnDef<Record<string, unknown>>[];
const config = drillConfigFromColumns(columns, rows, SANDBOX_DRILL);

describe("sandbox drill", () => {
  it("declares only levels its Dimensions and Measures honour", () => {
    expect(drillLevelProblems(config.dimensions, config.measures, { attributeKeys: ["status", "tier", "stop_reason"] })).toEqual([]);
  });
  it("drops nothing it was asked to offer", () => {
    expect(drillDroppedItems(config.dimensions, SANDBOX_DRILL)).toEqual([]);
  });
  it("a status's count and distinct owners match a hand count", () => {
    const q = { ...emptyDrillQuestion(["count", "owners"]), by: ["status"] };
    const groups = (drillAnswerLocally(rows, q, config).status ?? []) as unknown as {
      groups: { status: string };
      measures: Record<string, number>;
    }[];
    const running = groups.find((g) => g.groups.status === "running");
    expect(running?.measures.count).toBe(2);
    expect(running?.measures.owners).toBe(2);
  });
});
