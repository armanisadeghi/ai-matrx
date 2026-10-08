import { effectiveSubject } from "./editor/model";
import { failureSentence, NOT_REACHED } from "./serverFailure";

describe("failureSentence", () => {
  it("says it is our error, with the request id, when the server answered a 500", () => {
    const text = failureSentence({ status: 500, serverDetail: { detail: { request_id: "req-123" } } });
    expect(text).toContain("on our side");
    expect(text).toContain("req-123");
    expect(text).not.toMatch(/could not reach/i);
  });
  it("shows the server's own readable message for a refusal that carries one", () => {
    const body = { detail: { code: "not_draft", user_message: "This envelope has already been sent.", request_id: "r1" } };
    expect(failureSentence({ status: 409, serverDetail: body })).toBe("This envelope has already been sent.");
    expect(failureSentence({ status: 409, serverDetail: { detail: { message: "Nope." } } })).toBe("Nope.");
    expect(failureSentence({ status: 500, serverDetail: { detail: { request_id: "x" } } })).toContain("on our side");
  });
  it("keeps the reach wording only when nothing answered", () => {
    expect(failureSentence({})).toBe(NOT_REACHED);
    expect(failureSentence(undefined)).toBe(NOT_REACHED);
  });
});

describe("effectiveSubject", () => {
  const d = { email_subject: "", title: "doc-a" };
  it("names the real sender, never a placeholder", () => {
    expect(effectiveSubject(d, "Ada Lovelace")).toBe("Ada Lovelace sent you doc-a to sign");
    expect(effectiveSubject(d, "")).not.toMatch(/Sender name|Your name/);
  });
});
