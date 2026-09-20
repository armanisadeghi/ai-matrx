import type { ProviderBatch } from "../service/batchAdminService";
import {
  providerBatchesUrlState,
  turnaroundSeconds,
} from "./ProviderBatchesPanel";

const batch = (submitted_at: string | null, completed_at: string | null) =>
  ({ submitted_at, completed_at } as ProviderBatch);

describe("ProviderBatchesPanel table contracts", () => {
  it("keeps cross-tab focus controlled by the caller instead of a row URL", () => {
    expect(providerBatchesUrlState.selectedRow).toBe(false);
  });

  it("sorts turnaround by the displayed elapsed duration", () => {
    expect(
      turnaroundSeconds(batch("2026-09-20T00:00:00.000Z", "2026-09-20T00:02:30.000Z")),
    ).toBe(150);
    expect(turnaroundSeconds(batch("2026-09-20T00:00:00.000Z", null))).toBeNull();
  });
});
