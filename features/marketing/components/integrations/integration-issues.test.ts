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

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  gscConfigurationIssues,
  integrationsWriteIssues,
  integrationsWriteRefusal,
  providerActionDisabled,
  providerIssueMessages,
  type IntegrationIssue,
} from "@/features/marketing/components/integrations/integration-issues";
import {
  emptyProviderIntegration,
  parseSiteIntegrations,
  type SiteIntegrationsDraft,
} from "@/features/marketing/data/integrations-schema";

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

/*
  ROUND-2 VERDICT NEW-B6 — the page-level Save wrote the whole integrations blob
  through `updateSiteIntegrations` with no judge at all, gated only on the issue
  list the screen happened to be SHOWING; on the OAuth-review surface that list
  was filtered to Google Analytics, so the live `http://bhrcenter.com/` mismatch
  above was re-saved, unjudged, from a screen that never mentioned it.

  One judge, asked by every write path — and a source guard on the workspace,
  because the filter and the gate were two lines of a component.
*/
describe("integrationsWriteIssues / integrationsWriteRefusal — the whole-draft write", () => {
  const draft = (resourceRef: string): SiteIntegrationsDraft =>
    parseSiteIntegrations({
      marketing: {
        providers: {
          google_search_console: {
            enabled: true,
            credential_authority: "external_connection",
            credential_ref: "31b75c97-3710-4c2f-9834-dd6da29ca8b6",
            resource_ref: resourceRef,
          },
        },
      },
    });

  it("refuses the live mismatch, naming both sides", () => {
    const refusal = integrationsWriteRefusal(draft("http://bhrcenter.com/"), LIVE_SITE);
    expect(refusal).not.toBeNull();
    expect(refusal).toContain("bhrcenter.com");
    expect(refusal).toContain("ga4-oauth-qa-00fb6a62a3.invalid");
  });

  it("allows a draft whose property matches the site", () => {
    expect(
      integrationsWriteRefusal(
        draft("sc-domain:ga4-oauth-qa-00fb6a62a3.invalid"),
        LIVE_SITE,
      ),
    ).toBeNull();
  });

  it("carries the same issue the editor's list shows", () => {
    const issues = integrationsWriteIssues(draft("http://bhrcenter.com/"), LIVE_SITE);
    expect(issues.some((issue) => issue.field === "googleSearchConsole.resourceRef")).toBe(
      true,
    );
  });
});

describe("SiteIntegrationsWorkspace asks that judge and hides nothing", () => {
  const source = readFileSync(join(__dirname, "SiteIntegrationsWorkspace.tsx"), "utf8");

  it("judges the whole-draft write before updateSiteIntegrations", () => {
    expect(source).toContain("integrationsWriteRefusal(draftToSave");
  });

  it("no longer filters the issue list by surface", () => {
    expect(source).not.toMatch(/issues\.filter\(\(issue\) => issue\.field\.startsWith/);
  });

  it("gives the review surface the canonical Fix door", () => {
    expect(source).toContain("<GscBindingRefusalLine");
  });
});
