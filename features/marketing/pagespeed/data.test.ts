import type { TypedStreamEvent } from "@/lib/api/types";
import { describePagespeedStreamEvent } from "@/features/marketing/pagespeed/data";

function dataEvent(data: Record<string, unknown>): TypedStreamEvent {
  return { event: "data", data: { type: "seo-progress", ...data } };
}

describe("describePagespeedStreamEvent", () => {
  it("names the provider request and strategy", () => {
    expect(
      describePagespeedStreamEvent(
        dataEvent({
          kind: "seo.provider_request_started",
          run_id: "run-mobile",
          settings: { strategy: "mobile" },
        }),
      ),
    ).toEqual({
      stage: "provider",
      strategy: "mobile",
      runId: "run-mobile",
      message: "Mobile test is running at Google…",
    });
  });

  it("reports persistence and terminal receipts", () => {
    expect(
      describePagespeedStreamEvent(
        dataEvent({
          kind: "seo.observations_persisted",
          run_id: "run-desktop",
          strategy: "desktop",
        }),
      )?.stage,
    ).toBe("persisted");
    expect(
      describePagespeedStreamEvent(
        dataEvent({ kind: "seo.receipt", run_id: "run-desktop" }),
      ),
    ).toMatchObject({
      stage: "complete",
      runId: "run-desktop",
    });
  });

  it("ignores unrelated stream events", () => {
    expect(
      describePagespeedStreamEvent(
        dataEvent({ kind: "seo.provider_authenticated" }),
      ),
    ).toBeNull();
    expect(
      describePagespeedStreamEvent({
        event: "end",
        data: { reason: "completed" },
      }),
    ).toBeNull();
  });
});
