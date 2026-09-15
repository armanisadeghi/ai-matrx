/**
 * The meter must never invent a measurement. `get_usage_status` returns
 * synthesized zeros when `files.user_storage_usage` has no row for the user,
 * and 12 of the platform's accounts have such a row today — so "unmeasured" is
 * the COMMON case, not an edge one.
 */
import { summarizeQuota } from "./useStorageQuota";
import type { StorageUsageResponse } from "@/features/files/types";

const base: StorageUsageResponse = {
  tier_id: "free",
  tier_name: "Free",
  is_blocked: false,
  blocked_reason: null,
  bytes_used: 0,
  files_count: 0,
  daily_upload_count: 0,
  daily_upload_bytes: 0,
  max_storage_bytes: 5_368_709_120,
  max_file_size_bytes: null,
  max_files: null,
  max_versions_per_file: null,
  max_daily_uploads: null,
  max_daily_upload_bytes: null,
  max_bulk_items: null,
  rate_limit_uploads_per_min: null,
  rate_limit_downloads_per_min: null,
  features: {},
  ledger_measured: false,
  ledger_measured_at: null,
};

describe("summarizeQuota", () => {
  it("says unmeasured — and draws no bar — when the ledger row is absent", () => {
    const s = summarizeQuota(base);
    expect(s.unmeasured).toBe(true);
    expect(s.severity).toBe("unmeasured");
    expect(s.fraction).toBeNull();
    expect(s.percent).toBeNull();
  });

  it("reports a real fraction once the ledger row exists", () => {
    const s = summarizeQuota({
      ...base,
      ledger_measured: true,
      ledger_measured_at: "2026-09-15T00:00:00Z",
      bytes_used: 2_684_354_560,
    });
    expect(s.unmeasured).toBe(false);
    expect(s.percent).toBe(50);
    expect(s.severity).toBe("ok");
    expect(s.measuredAt).toBe("2026-09-15T00:00:00Z");
  });

  it.each([
    [0.85, "warning"],
    [0.97, "critical"],
  ])("escalates at %s", (frac, expected) => {
    const s = summarizeQuota({
      ...base,
      ledger_measured: true,
      bytes_used: Math.round(5_368_709_120 * frac),
    });
    expect(s.severity).toBe(expected);
  });

  it("blocked outranks everything, measured or not", () => {
    const s = summarizeQuota({
      ...base,
      is_blocked: true,
      blocked_reason: "Storage full",
    });
    expect(s.severity).toBe("blocked");
    expect(s.blockedReason).toBe("Storage full");
  });

  it("prefers billing's plan name over the retiring tier ladder (D11)", () => {
    expect(summarizeQuota(base, "Pro").tierName).toBe("Pro");
    expect(summarizeQuota(base, null).tierName).toBe("Free");
  });
});
