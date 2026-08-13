import { REACT_QUERY_DEFAULT_OPTIONS } from "./ReactQueryProvider";

describe("React Query defaults", () => {
  it("never retries mutations unless the individual mutation opts in", () => {
    expect(REACT_QUERY_DEFAULT_OPTIONS.mutations.retry).toBe(false);
  });

  it("keeps the existing bounded retry for read queries", () => {
    expect(REACT_QUERY_DEFAULT_OPTIONS.queries.retry).toBe(1);
  });
});
