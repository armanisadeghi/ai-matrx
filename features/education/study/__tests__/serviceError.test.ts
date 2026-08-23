import { fail, isPostgrestResultError } from "../service/serviceError";

const postgrestError = {
  code: "PGRST116",
  details: "Results contain 3 rows",
  hint: null,
  message: "JSON object requested, multiple (or no) rows returned",
};

describe("study service error reporting", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not mirror an already-structured PostgREST capture to console.error", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = fail("getStreak", postgrestError);

    expect(isPostgrestResultError(postgrestError)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: null,
      error:
        "getStreak: JSON object requested, multiple (or no) rows returned — Results contain 3 rows — (PGRST116)",
    });
  });

  it("still screams for failures that have no structured Supabase capture", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = new Error("offline computation failed");

    const result = fail("compute", error);

    expect(isPostgrestResultError(error)).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "[study] compute: offline computation failed",
      error,
    );
    expect(result).toEqual({
      data: null,
      error: "compute: offline computation failed",
    });
  });
});
