import { mapPgError } from "@/features/scopes/service/rpcResult";

describe("mapPgError diagnostics ownership", () => {
  it("does not mirror an already-captured PostgREST result through console.error", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(
      mapPgError({
        code: "PGRST002",
        message: "Could not query the database for the schema cache. Retrying.",
        details: null,
        hint: null,
      }),
    ).toMatchObject({ code: "internal" });
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("keeps thrown application errors loud", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("mapper failed");

    mapPgError(failure);

    expect(errorSpy).toHaveBeenCalledWith(
      "[scopes/rpcResult] supabase error",
      failure,
    );
    errorSpy.mockRestore();
  });
});
