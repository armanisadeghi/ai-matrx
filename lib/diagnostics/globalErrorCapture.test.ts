import { UnregisteredShellIconError } from "@/features/shell/shellIconMap";
import {
  captureError,
  clearCapturedErrors,
  getSnapshot,
} from "./errorCaptureStore";
import {
  buildConsoleCaptureInput,
  isExpectedNextNavigationRecovery,
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

  it("recognizes Next's successful RSC-to-document navigation fallback", () => {
    expect(
      isExpectedNextNavigationRecovery([
        "Failed to fetch RSC payload for https://www.aimatrx.com/administration/agents/system-agents/agents/agent-1/build. Falling back to browser navigation.",
        new TypeError("Failed to fetch"),
      ]),
    ).toBe(true);
  });

  it("does not hide similar application fetch failures", () => {
    expect(
      isExpectedNextNavigationRecovery([
        "Failed to fetch agent payload. Falling back to browser navigation.",
        new TypeError("Failed to fetch"),
      ]),
    ).toBe(false);
    expect(
      isExpectedNextNavigationRecovery([
        "Failed to fetch RSC payload for /agents/agent-1/build. Falling back to browser navigation.",
        new Error("request failed"),
      ]),
    ).toBe(false);
  });
});
