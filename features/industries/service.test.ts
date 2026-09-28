/**
 * Query contract: an archived industry must never reach an active taxonomy
 * picker, including the administrative view that requests inactive entries.
 */

const queryResult = { data: [], error: null };
const query = {
  select: jest.fn(),
  is: jest.fn(),
  order: jest.fn(),
  eq: jest.fn(),
  then: (resolve: (value: typeof queryResult) => unknown) =>
    Promise.resolve(queryResult).then(resolve),
};
const from = jest.fn();
const schema = jest.fn();

query.select.mockReturnValue(query);
query.is.mockReturnValue(query);
query.order.mockReturnValue(query);
query.eq.mockReturnValue(query);
from.mockReturnValue(query);
schema.mockReturnValue({ from });

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema },
}));

import { fetchIndustries } from "./service";

describe("fetchIndustries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.select.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    from.mockReturnValue(query);
    schema.mockReturnValue({ from });
  });

  it("refuses archived taxonomy rows even when inactive entries are requested", async () => {
    await fetchIndustries(true);

    expect(schema).toHaveBeenCalledWith("iam");
    expect(from).toHaveBeenCalledWith("industries");
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.eq).not.toHaveBeenCalledWith("is_active", true);
  });

  it("combines the archive refusal with the active-only filter by default", async () => {
    await fetchIndustries();

    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
  });
});
