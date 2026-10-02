/**
 * A REQUIRED VALUE THE PAGE CANNOT FILL OFFERS, NEVER BLOCKS (Arman,
 * 2026-09-27). "Translate to Spanish" launched with nothing selected used to
 * throw "Cannot run … required values are missing" and stop. Now:
 *   (a) interactive → the person is asked (type it / run without / cancel)
 *       and can proceed;
 *   (b) direct/background → the run proceeds and a visible notice names the
 *       missing value;
 *   (c) Cancel stops the launch with an error that no toast boundary shows.
 * The resolver half is exercised for real: whatever prepareLaunchMappings
 * returns must resolve with ZERO errors, or the launch thunk's post-precheck
 * backstop would toast the refusal anyway.
 */

const mockPromptForValues = jest.fn();
jest.mock("@/components/dialogs/value-prompts/ValuePromptsDialogHost", () => ({
  promptForValues: (...args: unknown[]) => mockPromptForValues(...args),
}));

const mockToast = { info: jest.fn(), error: jest.fn(), warning: jest.fn() };
jest.mock("@/lib/toast", () => ({ toast: mockToast }));

jest.mock("@/features/surfaces/services/bind-agent-to-surface.service", () => ({
  fetchSurfaceBindingLayers: jest.fn(),
}));

import {
  LaunchCancelledByPerson,
  prepareLaunchMappings,
} from "../surface-scope-mapping";
import { resolveValueMappings } from "@/features/surfaces/utils/value-mapping-resolver";
import type { ValueMappingMap } from "@/features/surfaces/types";

const merged: ValueMappingMap = {
  text: { mapType: "surface_value", target: "selected_text", required: true },
};
const definitions = [{ name: "text", required: false, defaultValue: null }];

function resolveErrors(mappings: ValueMappingMap, scope: Record<string, unknown>) {
  return resolveValueMappings(scope, mappings, definitions, [], {
    autoNameMatch: false,
  });
}

beforeEach(() => {
  mockPromptForValues.mockReset();
  Object.values(mockToast).forEach((fn) => fn.mockReset());
});

describe("prepareLaunchMappings — a missing required value", () => {
  test("(a) interactive: the person is asked, names the value, and can run without it", async () => {
    mockPromptForValues.mockResolvedValue({ text: "" });
    const out = await prepareLaunchMappings({
      merged,
      applicationScope: {},
      interactive: true,
      title: "Translate to Spanish",
    });
    expect(mockPromptForValues).toHaveBeenCalledTimes(1);
    const req = mockPromptForValues.mock.calls[0][0];
    expect(req.description).toContain("selected text");
    expect(req.fields).toEqual([
      expect.objectContaining({ name: "text", required: false }),
    ]);
    expect(out.text).toEqual(
      expect.objectContaining({ mapType: "surface_value", required: false }),
    );
    expect(resolveErrors(out, {}).errors).toEqual([]);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  test("(a) interactive: a typed value is used for the run", async () => {
    mockPromptForValues.mockResolvedValue({ text: "hola" });
    const out = await prepareLaunchMappings({
      merged,
      applicationScope: { selected_text: "   " },
      interactive: true,
      title: "Translate to Spanish",
    });
    expect(out.text).toEqual({ mapType: "direct_value", target: "hola" });
    expect(resolveErrors(out, {}).variableValues.text).toBe("hola");
  });

  test("(b) non-interactive: proceeds with a visible notice naming the value", async () => {
    const out = await prepareLaunchMappings({
      merged,
      applicationScope: {},
      interactive: false,
      title: "Translate to Spanish",
    });
    expect(mockPromptForValues).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info.mock.calls[0][0]).toContain("selected text");
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(resolveErrors(out, {}).errors).toEqual([]);
  });

  test("(b) non-interactive: a required prompt_user value is announced, not refused", async () => {
    const out = await prepareLaunchMappings({
      merged: {
        tone: { mapType: "prompt_user", prompt: "Which tone?", required: true },
      },
      applicationScope: {},
      interactive: false,
      title: "Rewrite",
    });
    expect(out.tone).toBeUndefined();
    expect(mockToast.info.mock.calls[0][0]).toContain("Which tone?");
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  test("(c) Cancel stops the launch cleanly — wordless AbortError, no error toast", async () => {
    mockPromptForValues.mockResolvedValue(null);
    const run = prepareLaunchMappings({
      merged,
      applicationScope: {},
      interactive: true,
      title: "Translate to Spanish",
    });
    await expect(run).rejects.toBeInstanceOf(LaunchCancelledByPerson);
    const err = await run.catch((e: Error) => e);
    expect(err.message).toBe("");
    expect(err.name).toBe("AbortError");
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  test("a present value asks nothing", async () => {
    const out = await prepareLaunchMappings({
      merged,
      applicationScope: { selected_text: "hello" },
      interactive: true,
      title: "Translate to Spanish",
    });
    expect(mockPromptForValues).not.toHaveBeenCalled();
    expect(out).toEqual(merged);
  });
});
