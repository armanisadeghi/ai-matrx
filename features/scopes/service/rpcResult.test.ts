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

  it("keeps a Supabase upstream connection reset out of the repair queue", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const failure = {
      message:
        "upstream connect error or disconnect/reset before headers. retried and the latest reset reason: remote connection failure, transport failure reason: delayed connect error: 111",
    };

    expect(mapPgError(failure)).toMatchObject({
      code: "internal",
      message: failure.message,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[scopes/rpcResult] network unreachable (browser offline?)",
      failure,
    );
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
