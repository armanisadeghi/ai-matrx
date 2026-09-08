/**
 * Judged against the exact production defect: a mandate holder save that
 * toasted the four words `Failed to fetch` and then succeeded on an identical
 * retry (walk of 2026-09-08).
 */
import {
  describeFailure,
  failureLine,
  isTransportFailure,
} from "@/lib/failure/transport";

describe("the browser's words are recognised, the server's are not", () => {
  it.each([
    new TypeError("Failed to fetch"),
    new TypeError("Load failed"),
    new TypeError("NetworkError when attempting to fetch resource."),
    new TypeError("fetch failed"),
    "TypeError: Failed to fetch",
    Object.assign(new Error("aborted"), { name: "AbortError" }),
  ])("counts %s as a transport refusal", (error) => {
    expect(isTransportFailure(error)).toBe(true);
  });

  it.each([
    new Error("We couldn't open this mandate. It may have been deleted."),
    new Error("Failed to fetch the roster for this organization"),
    new Error("permission denied for view vw_shortcut"),
  ])("leaves a door's own sentence alone: %s", (error) => {
    expect(isTransportFailure(error)).toBe(false);
    expect(describeFailure(error).sentence).toBe(error.message);
    expect(describeFailure(error).transient).toBe(false);
  });
});

describe("what the walker would have read instead", () => {
  it("never prints the raw transport string at a person", () => {
    const line = failureLine(new TypeError("Failed to fetch"), {
      action: "saving this holder",
    });
    expect(line).not.toContain("Failed to fetch");
    expect(line).toContain("saving this holder");
  });

  it("names a retry as the remedy, because a retry is what worked", () => {
    const failure = describeFailure(new TypeError("Failed to fetch"), {
      action: "saving this holder",
    });
    expect(failure.transient).toBe(true);
    expect(failure.remedy).toMatch(/try again/i);
  });

  it("does not claim the write was lost — nobody knows that", () => {
    const failure = describeFailure(new TypeError("Failed to fetch"), {
      action: "saving this holder",
    });
    expect(failure.sentence).toMatch(/may or may not/i);
  });

  it("says the write is safe to repeat only when the caller says it is", () => {
    expect(
      describeFailure(new TypeError("Failed to fetch"), { retrySafe: true })
        .remedy,
    ).toMatch(/changes nothing/i);
    expect(
      describeFailure(new TypeError("Failed to fetch"), { retrySafe: false })
        .remedy,
    ).toMatch(/reload to confirm/i);
  });

  it("keeps the raw string for the Error Inspector, never for the screen", () => {
    const failure = describeFailure(new TypeError("Failed to fetch"));
    expect(failure.raw).toBe("Failed to fetch");
    expect(failure.sentence).not.toBe("Failed to fetch");
  });

  it("says so plainly when the device is simply offline", () => {
    const spy = jest
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false as never);
    const failure = describeFailure(new TypeError("Failed to fetch"), {
      action: "saving this holder",
    });
    expect(failure.sentence).toMatch(/offline/i);
    expect(failure.sentence).toMatch(/nothing was changed/i);
    spy.mockRestore();
  });

  it("still says something when the thrown thing has no message", () => {
    expect(describeFailure({}, { fallback: "Save failed." }).sentence).toBe(
      "Save failed.",
    );
  });
});
