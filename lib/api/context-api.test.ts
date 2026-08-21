import { resolveSelectedBackendOrRaise, SelectedBackendUnavailableError } from "./context-api";

describe("selected backend identity", () => {
  it("refuses production substitution for an unavailable selection", () => {
    expect(() => resolveSelectedBackendOrRaise("not-configured")).toThrow(SelectedBackendUnavailableError);
    expect(() => resolveSelectedBackendOrRaise("not-configured")).toThrow("production substitution is refused");
  });
});
