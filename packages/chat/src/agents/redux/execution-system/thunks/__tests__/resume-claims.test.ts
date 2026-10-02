import {
  nextResumeStreamClosingAttempt,
  onResumeStreamOpened,
  RESUME_STREAM_CLOSING_MAX_RETRIES,
} from "../resume-claims";

describe("resume stream-closing retry budget", () => {
  it("keeps the continuation signal alive for a bounded number of retries", () => {
    const requestId = "stream-closing-request";
    for (
      let attempt = 1;
      attempt <= RESUME_STREAM_CLOSING_MAX_RETRIES;
      attempt++
    ) {
      expect(nextResumeStreamClosingAttempt(requestId)).toBe(attempt);
    }
    expect(nextResumeStreamClosingAttempt(requestId)).toBeNull();
  });

  it("resets after a resume stream opens", () => {
    const requestId = "opened-request";
    expect(nextResumeStreamClosingAttempt(requestId)).toBe(1);
    onResumeStreamOpened(requestId);
    expect(nextResumeStreamClosingAttempt(requestId)).toBe(1);
  });
});
