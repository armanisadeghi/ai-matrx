/**
 * A TOAST THAT STAYS UNTIL DISMISSED NEVER PARKS OVER AN ACTION ROW —
 * cold walk 22 (friction).
 *
 * The duplicate-name notice on a new Rulebook stays until she closes it; at
 * the Toaster's bottom-right it covered the interview drawer's footer —
 * "Start the interview" and the sentence beside it — for as long as it
 * stayed. RED before: the persistent toast carried no position, so it landed
 * bottom-right with everything else.
 */
const mockSuccess = jest.fn((..._args: unknown[]) => "t1");
const mockToast = Object.assign(jest.fn(() => "t0"), {
  success: mockSuccess,
  error: jest.fn(() => "t2"),
  warning: jest.fn(() => "t3"),
  info: jest.fn(() => "t4"),
  message: jest.fn(() => "t5"),
  dismiss: jest.fn(),
});
jest.mock("sonner", () => ({ toast: mockToast }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { recordToast, toast } from "@/lib/toast";

const RULEBOOK = {
  type: "rulebook",
  id: "008779b9-f7e1-4fcb-8dbf-e7f72097ef6f",
  title: "walk22-Regrout or Retile Verdict",
};

function optionsOfLastCall(): Record<string, unknown> {
  const calls = mockSuccess.mock.calls;
  return (calls[calls.length - 1]?.[1] ?? {}) as Record<string, unknown>;
}

describe("where a toast is raised", () => {
  afterEach(() => toast.dismiss());

  it("a toast that stays until dismissed is raised clear of the bottom action rows", () => {
    recordToast.success(RULEBOOK, `"${RULEBOOK.title}" started`, {
      description: "You already have a Rulebook called … This one is separate.",
      duration: Infinity,
    });
    expect(optionsOfLastCall().position).toBe("top-center");
  });

  it("an ordinary timed toast keeps the Toaster's own position", () => {
    recordToast.success(RULEBOOK, `"${RULEBOOK.title}" started`, {
      description: "Start now — your first rules appear within minutes.",
    });
    expect(optionsOfLastCall().position).toBeUndefined();
  });

  it("a caller that names a position keeps it", () => {
    toast.success("Saved", { duration: Infinity, position: "bottom-left" });
    expect(optionsOfLastCall().position).toBe("bottom-left");
  });
});
