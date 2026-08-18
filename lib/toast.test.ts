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
    expect(mockToastError).toHaveBeenCalledWith("Save failed", undefined);
  });

  it("renders an already-captured aggregate without duplicating the error", () => {
    toastErrorAlreadyCaptured("Bulk operation finished with 3 failures.");

    expect(mockToastError).toHaveBeenCalledWith(
      "Bulk operation finished with 3 failures.",
      undefined,
    );
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
