// ORG-GATE-AUDIT: closing the organization picker is "nothing happened" for
// EVERY caller, enforced once at the toast boundary — not per caller. Each
// fixed service's ordinary catch toasts what it caught; none of the three
// shapes a caller uses may raise a toast or file an Error Inspector row, and
// an ordinary failure still does. Fails against the pre-fix lib/toast.ts and
// organization-gate.ts (the error carried a sentence and toasts were raised).
const mockToastError = jest.fn();
const mockToastWarning = jest.fn();
const mockCaptureError = jest.fn();

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: mockToastError, warning: mockToastWarning }),
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: mockCaptureError,
}));

import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

describe("closing the organization picker is silent everywhere", () => {
  beforeEach(() => jest.clearAllMocks());

  it("carries no user-facing sentence, so an inline error line renders nothing", () => {
    const cancelled = new OrganizationSelectionCancelled();
    expect(cancelled.message).toBe("");
    expect(cancelled.reason).toMatch(/cancelled/);
  });

  it.each([
    ["toast.error(err.message)", () => toast.error(new OrganizationSelectionCancelled().message)],
    ["toast.error(err)", () => toast.error(new OrganizationSelectionCancelled() as unknown as string)],
    ["toast.error(title, { description: err })", () =>
      toast.error("Could not disconnect Bing", {
        description: new OrganizationSelectionCancelled() as unknown as string,
      })],
    ["toast.error(title, { description: err.message }) — the Bing Connect shape", () => {
      const err = new OrganizationSelectionCancelled();
      toast.error("Could not start Bing sign-in", { description: err.message });
    }],
    ["toast.warning(err.message)", () => toast.warning(new OrganizationSelectionCancelled().message)],
    ["toastErrorAlreadyCaptured(err.message)", () =>
      toastErrorAlreadyCaptured(new OrganizationSelectionCancelled().message)],
  ])("%s raises nothing and files nothing", (_shape, raise) => {
    raise();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockToastWarning).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("an empty description with no cancellation behind it is still shown", () => {
    jest.useFakeTimers({ now: Date.now() + 60_000 });
    toast.error("Upload failed", { description: "" });
    jest.useRealTimers();
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  it("an ordinary failure still toasts and is still filed", () => {
    toast.error("Could not disconnect Bing Webmaster.");
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
  });
});
