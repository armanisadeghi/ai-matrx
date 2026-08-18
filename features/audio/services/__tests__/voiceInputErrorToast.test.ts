import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { showVoiceInputErrorToast } from "../voiceInputErrorToast";

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn() },
  toastErrorAlreadyCaptured: jest.fn(),
}));

describe("showVoiceInputErrorToast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not capture a second queue row for a persisted fallback failure", () => {
    const onHelp = jest.fn();

    showVoiceInputErrorToast({
      message: "Load failed",
      code: "TRANSCRIPTION_FAILED",
      onHelp,
    });

    expect(toastErrorAlreadyCaptured).toHaveBeenCalledWith(
      "Voice input failed",
      expect.objectContaining({
        description: "Load failed",
        action: { label: "Get Help", onClick: onHelp },
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps independently actionable capture failures in the queue", () => {
    showVoiceInputErrorToast({
      message: "The microphone was interrupted",
      code: "MIC_INTERRUPTED",
      onHelp: jest.fn(),
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Voice input failed",
      expect.objectContaining({
        description: "The microphone was interrupted",
      }),
    );
    expect(toastErrorAlreadyCaptured).not.toHaveBeenCalled();
  });
});
