import {
  clearCapturedErrors,
  getSnapshot,
  getStatsSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  recordUnavailable,
  resolveRecordUnavailableCapture,
} from "@/lib/records/recordUnavailable";

describe("recordUnavailable capture reconciliation", () => {
  beforeEach(() => {
    clearCapturedErrors();
  });

  it("keeps an unresolved access gap loud and unknown", () => {
    recordUnavailable({
      entity: "site",
      reason: "unknown",
      recordId: "site-1",
      token: "web_site",
    });

    expect(getSnapshot()[0]).toMatchObject({
      tier: "red",
      message: "Zero-row read for site site-1 (unknown)",
      raw: { reason: "unknown" },
    });
  });

  it("reclassifies a resolved denial in place without suppressing it", () => {
    const error = recordUnavailable({
      entity: "site",
      reason: "unknown",
      recordId: "site-1",
      token: "web_site",
    });
    const originalId = getSnapshot()[0]?.id;

    resolveRecordUnavailableCapture(error, "denied");

    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      id: originalId,
      count: 1,
      tier: "yellow",
      tierRuleId: "record-unavailable-resolved-denial",
      message: "Zero-row read for site site-1 (denied)",
      userMessage: "You don't have access to this site.",
      raw: { reason: "denied" },
    });
    expect(getStatsSnapshot()).toMatchObject({
      red: 0,
      yellow: 1,
      unseenRed: 0,
    });
  });

  it.each(["missing", "deleted", "signed-out", "ok"] as const)(
    "records a resolved %s state but keeps the broken read loud",
    (resolution) => {
      const error = recordUnavailable({
        entity: "site",
        reason: "unknown",
        recordId: "site-1",
        token: "web_site",
      });

      resolveRecordUnavailableCapture(error, resolution);

      expect(getSnapshot()[0]).toMatchObject({
        tier: "red",
        message: `Zero-row read for site site-1 (${resolution})`,
        raw: { reason: resolution },
      });
    },
  );
});
