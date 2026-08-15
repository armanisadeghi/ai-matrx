import { buildComplianceEnvelope } from "./message-compliance";

describe("buildComplianceEnvelope", () => {
  it("builds the exact RFC 8058 pair and a visible permanent opt-out", () => {
    const envelope = buildComplianceEnvelope({
      origin: "https://www.aimatrx.com/",
      unsubscribeToken: "opaque-token",
      senderName: "Acme",
      postal: { line1: "1 Test Way", country: "US" },
    });

    expect(envelope.headers).toEqual({
      "List-Unsubscribe":
        "<https://www.aimatrx.com/api/unsubscribe/opaque-token>, <https://www.aimatrx.com/unsubscribe/opaque-token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(envelope.textFooter).toContain(
      "Unsubscribe: https://www.aimatrx.com/unsubscribe/opaque-token",
    );
    expect(envelope.textFooter).toContain("Acme · 1 Test Way, US");
  });
});
