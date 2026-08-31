import { toast } from "@/lib/toast";
import { notifyMissingAutomationMandate } from "./AutomationButton";

jest.mock("@/lib/toast", () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("AutomationButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps an intentionally absent optional mandate out of system errors", () => {
    notifyMissingAutomationMandate("mandates.goal_writer");

    expect(toast.info).toHaveBeenCalledWith(
      'Not yet — this needs the mandate "mandates.goal_writer", which does not exist. Create it and this runs.',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});
