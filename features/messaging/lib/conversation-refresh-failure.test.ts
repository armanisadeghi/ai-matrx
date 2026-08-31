import { SessionUnavailableError } from "@/lib/supabase/authRetry";
import { reportConversationRefreshFailure } from "@/features/messaging/lib/conversation-refresh-failure";

describe("reportConversationRefreshFailure", () => {
  it("keeps an unavailable session out of the captured console-error lane", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      reportConversationRefreshFailure(new SessionUnavailableError());

      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("still reports genuine conversation-refresh failures as errors", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("database unavailable");

    try {
      reportConversationRefreshFailure(failure);

      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        "[Messaging] Failed to fetch conversation details:",
        failure,
      );
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
