import { shouldReportMandateSetFailure } from "./useMandateSet";

describe("shouldReportMandateSetFailure", () => {
  it("does not report an expected unassigned mandate", () => {
    expect(
      shouldReportMandateSetFailure("chat.quick_org_chart", [
        "chat.quick_org_chart",
      ]),
    ).toBe(false);
  });

  it("keeps unexpected mandate resolution failures loud", () => {
    expect(
      shouldReportMandateSetFailure("chat.quick_research", [
        "chat.quick_org_chart",
      ]),
    ).toBe(true);
  });
});
