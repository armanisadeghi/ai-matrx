import { UnregisteredShellIconError } from "@/features/shell/shellIconMap";
import {
  captureError,
  clearCapturedErrors,
  getSnapshot,
} from "./errorCaptureStore";
import {
  buildConsoleCaptureInput,
  serializeForErrorCapture,
} from "./globalErrorCapture";

describe("global console error serialization", () => {
  beforeEach(() => {
    clearCapturedErrors();
  });

  it("preserves an Error nested inside a context object", () => {
    const cause = new Error("association rejected");
    const serialized = serializeForErrorCapture(
      {
        conversationId: "cef7a4c2-8f84-41d3-bf96-66e65833ad4a",
        err: cause,
      },
      false,
    );

    expect(serialized).toEqual({
      conversationId: "cef7a4c2-8f84-41d3-bf96-66e65833ad4a",
      err: {
        name: "Error",
        message: "association rejected",
      },
    });
  });

  it("terminates circular diagnostic objects safely", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(serializeForErrorCapture(value, false)).toEqual({
      self: "[Circular]",
    });
  });

  it("preserves shell icon registry failures as structured diagnostics", () => {
    const input = buildConsoleCaptureInput([
      new UnregisteredShellIconError("NotARegisteredIcon"),
    ]);

    expect(input).toMatchObject({
      source: "shell-navigation",
      relation: "icon:NotARegisteredIcon",
      code: "SHELL_ICON_UNREGISTERED",
      message: "[shell-nav] Unregistered icon name: NotARegisteredIcon",
      name: "UnregisteredShellIconError",
      details:
        "The shell rendered the CircleHelp fallback because NotARegisteredIcon is not registered.",
    });

    captureError(input);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      source: "shell-navigation",
      tier: "red",
      relation: "icon:NotARegisteredIcon",
      code: "SHELL_ICON_UNREGISTERED",
    });
  });

  it("keeps unrelated console errors on the generic fallback adapter", () => {
    expect(buildConsoleCaptureInput(["plain console failure"])).toMatchObject({
      source: "console-error",
      message: "plain console failure",
    });
  });
});
