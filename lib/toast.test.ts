const mockToast = jest.fn();
const mockToastError = jest.fn();
const mockToastWarning = jest.fn();
const mockCaptureError = jest.fn();

jest.mock("sonner", () => ({
  toast: Object.assign(mockToast, {
    error: mockToastError,
    warning: mockToastWarning,
  }),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: mockCaptureError,
}));

import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";

describe("captured toast boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("captures an ordinary error toast", () => {
    toast.error("Save failed");

    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "user-toast",
        message: "Save failed",
      }),
    );
    // Sonner is handed `duration: Infinity`: its visibility-paused timer is out
    // of the loop and lib/toast's wall clock dismisses the toast instead.
    expect(mockToastError).toHaveBeenCalledWith(
      "Save failed",
      expect.objectContaining({ duration: Infinity }),
    );
  });

  it("renders an already-captured aggregate without duplicating the error", () => {
    toastErrorAlreadyCaptured("Bulk operation finished with 3 failures.");

    expect(mockToastError).toHaveBeenCalledWith(
      "Bulk operation finished with 3 failures.",
      expect.objectContaining({ duration: Infinity }),
    );
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
