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
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: mockCaptureError,
}));

import { errorSentence, toast, toastErrorAlreadyCaptured } from "@/lib/toast";

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

describe("an error toast is always a readable sentence", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads the sentence out of a PostgREST-shaped error object", () => {
    toast.error({ code: "42501", message: "Edit access does not include deleting this mandate." } as unknown as string);
    expect(mockToastError.mock.calls[0][0]).toBe("Edit access does not include deleting this mandate.");
  });

  it("never lets a stringified object reach the screen", () => {
    toast.error(String({ code: "42501" }));
    expect(mockToastError.mock.calls[0][0]).not.toContain("[object Object]");
    expect(errorSentence({})).not.toContain("[object Object]");
  });
});
