/*
  FORCING TEST for the two Integrations-editor defects the zero-authorship
  verifier found on 2026-09-17 (google-native `VERIFY-U-P4-U-M1.md`, B-1 + B-3).

  The fixture is the pair that is LIVE in the platform database, read
  2026-09-17 and not modified: site `d7c4aeb1-a920-4fa0-b118-00ffed913c22`
  ("AI Matrx OAuth QA GA4 00fb6a62a3", domain `ga4-oauth-qa-00fb6a62a3.invalid`,
  root_url `https://ga4-oauth-qa-00fb6a62a3.invalid`) bound to the Search
  Console property `http://bhrcenter.com/`. That binding got through because
  every guard asked `enabled` first.
*/

import {
  gscConfigurationIssues,
  providerActionDisabled,
  providerIssueMessages,
  type IntegrationIssue,
} from "@/features/marketing/components/integrations/integration-issues";
import { emptyProviderIntegration } from "@/features/marketing/data/integrations-schema";

const LIVE_SITE = {
  root_url: "https://ga4-oauth-qa-00fb6a62a3.invalid",
  domain: "ga4-oauth-qa-00fb6a62a3.invalid",
};

function gscDraft(overrides: {
  enabled: boolean;
  resourceRef: string;
  credentialRef?: string;
}) {
  return {
    googleSearchConsole: {
      ...emptyProviderIntegration(),
      credentialAuthority: "external_connection" as const,
      credentialRef:
        overrides.credentialRef ?? "31b75c97-3710-4c2f-9834-dd6da29ca8b6",
      enabled: overrides.enabled,
      resourceRef: overrides.resourceRef,
    },
  };
}

describe("gscConfigurationIssues — the guard runs before the first Enable", () => {
  it("raises the mismatch on a draft that is still DISABLED", () => {
    // This is the whole defect: at first setup `enabled` is false, so the old
    // guard returned nothing and the next click bound the wrong property.
    const issues = gscConfigurationIssues(
      gscDraft({ enabled: false, resourceRef: "http://bhrcenter.com/" }),
      LIVE_SITE,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("googleSearchConsole.resourceRef");
    expect(issues[0].message).toContain("bhrcenter.com");
    expect(issues[0].message).toContain("ga4-oauth-qa-00fb6a62a3.invalid");
  });

  it("raises the same mismatch once the binding is enabled", () => {
    expect(
      gscConfigurationIssues(
        gscDraft({ enabled: true, resourceRef: "http://bhrcenter.com/" }),
        LIVE_SITE,
      ),
    ).toHaveLength(1);
  });

  it("stays silent for the site's own domain property", () => {
    expect(
      gscConfigurationIssues(
        gscDraft({
          enabled: false,
          resourceRef: "sc-domain:ga4-oauth-qa-00fb6a62a3.invalid",
        }),
        LIVE_SITE,
      ),
    ).toHaveLength(0);
  });

  it("stays silent when no property is picked — that is the validator's issue, not this one", () => {
    expect(
      gscConfigurationIssues(
        gscDraft({ enabled: true, resourceRef: "" }),
        LIVE_SITE,
      ),
    ).toHaveLength(0);
  });
});

describe("the per-provider button answers for itself", () => {
  const issues: IntegrationIssue[] = [
    {
      field: "googleSearchConsole.resourceRef",
      message: "This site is https://ga4-oauth-qa-00fb6a62a3.invalid/; you picked http://bhrcenter.com/.",
    },
    { field: "googleAnalytics4.resourceRef", message: "GA4 property is gone." },
  ];

  it("gives each card only its own issues", () => {
    expect(providerIssueMessages(issues, "googleSearchConsole")).toEqual([
      issues[0].message,
    ]);
    expect(providerIssueMessages(issues, "googleAnalytics4")).toEqual([
      issues[1].message,
    ]);
    expect(providerIssueMessages(issues, "pageSpeedInsights")).toEqual([]);
  });

  it("is DISABLED while an issue stands — never an enabled click that does nothing", () => {
    expect(
      providerActionDisabled({
        enabled: true,
        dirty: true,
        saving: false,
        issueCount: 1,
      }),
    ).toBe(true);
    // The exact shape of B-3: dirty + enabled + a mismatch used to leave the
    // button live while the handler returned early.
    expect(
      providerActionDisabled({
        enabled: false,
        dirty: true,
        saving: false,
        issueCount: 1,
      }),
    ).toBe(true);
  });

  it("is enabled for a dirty, issue-free draft, and idle when nothing changed", () => {
    expect(
      providerActionDisabled({
        enabled: true,
        dirty: true,
        saving: false,
        issueCount: 0,
      }),
    ).toBe(false);
    expect(
      providerActionDisabled({
        enabled: true,
        dirty: false,
        saving: false,
        issueCount: 0,
      }),
    ).toBe(true);
    expect(
      providerActionDisabled({
        enabled: true,
        dirty: true,
        saving: true,
        issueCount: 0,
      }),
    ).toBe(true);
  });
});
