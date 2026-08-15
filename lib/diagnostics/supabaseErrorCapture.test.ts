import { postgrestResultErrorMessage } from "@/lib/diagnostics/supabaseErrorCapture";

describe("postgrestResultErrorMessage", () => {
  it("preserves the upstream sentence when PostgREST provides one", () => {
    expect(
      postgrestResultErrorMessage({
        error: { message: "canceling statement due to statement timeout" },
        status: 500,
      }),
    ).toBe("canceling statement due to statement timeout");
  });

  it("names the HTTP failure when PostgREST returns an empty message", () => {
    expect(
      postgrestResultErrorMessage({
        error: { message: "" },
        status: 500,
        statusText: "Internal Server Error",
      }),
    ).toBe(
      "Supabase request failed with HTTP 500 (Internal Server Error); PostgREST returned no error message",
    );
  });
});
