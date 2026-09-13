import { resolveSelectedBackendOrRaise, SelectedBackendUnavailableError } from "./context-api";

describe("selected backend identity", () => {
  it("refuses production substitution for an unavailable selection", () => {
    expect(() => resolveSelectedBackendOrRaise("not-configured")).toThrow(SelectedBackendUnavailableError);
    expect(() => resolveSelectedBackendOrRaise("not-configured")).toThrow("production substitution is refused");
  });

  it("identifies a stale retired EC2 selection without routing it", () => {
    expect(() => resolveSelectedBackendOrRaise("ec2")).toThrow(
      SelectedBackendUnavailableError,
    );
    expect(() => resolveSelectedBackendOrRaise("ec2")).toThrow(
      "EC2 AI API selection was retired",
    );
  });
});
