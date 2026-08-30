import { REACT_QUERY_DEFAULT_OPTIONS } from "./ReactQueryProvider";
import { RecordUnavailableError } from "@/lib/records/recordUnavailable";

describe("React Query defaults", () => {
  it("never retries mutations unless the individual mutation opts in", () => {
    expect(REACT_QUERY_DEFAULT_OPTIONS.mutations.retry).toBe(false);
  });

  it("retries transient failed queries once", () => {
    expect(
      REACT_QUERY_DEFAULT_OPTIONS.queries.retry(0, new Error("timeout")),
    ).toBe(true);
    expect(
      REACT_QUERY_DEFAULT_OPTIONS.queries.retry(1, new Error("timeout")),
    ).toBe(false);
  });

  it("does not retry deterministic record-unavailable reads", () => {
    const error = new RecordUnavailableError({
      entity: "brand",
      recordId: "brand-1",
      reason: "deleted",
      token: "web_brand",
    });

    expect(REACT_QUERY_DEFAULT_OPTIONS.queries.retry(0, error)).toBe(false);
  });
});
