/**
 * The 2026-09-25 integration pass: the pieces the new admin suite wires
 * together, each pinned where it is decided.
 */
import { buildFacts, sectionsFor } from "../facts";
import { contractStateOf } from "../rows";
import { adminMandateRecordHref } from "@/features/mandates/admin-routes";
import { adminMandateListConfig } from "../listConfig";
import { mandateListHref, unconvertedCallsHref } from "@/features/mandates/dashboard/list-link";
import { workflowAdvanceEligibility } from "@/features/mandates/admin/workflow-advance";
import type { WorkflowImpactVerdict } from "@/features/mandates/admin/workflow-impact";

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));

const EMPTY_REPORTS = { codeTruth: null, coverage: null, impact: null, workflowImpact: null };

describe("code-scan columns are computed by the database only when needed", () => {
  it("asks for the scan read when a source column is filtered or sorted", () => {
    const filtered = sectionsFor({ search: "", filters: { languages: { kind: "select", values: ["Python"] } } });
    expect(filtered).toContain("sources");
    expect(sectionsFor({ search: "", filters: {} }, "callSites")).toContain("sources");
    expect(buildFacts(EMPTY_REPORTS, filtered)).toMatchObject({ sources: "all" });
  });

  it("never pays for it on a plain page", () => {
    const plain = sectionsFor({ search: "", filters: {} }, "name");
    expect(plain).not.toContain("sources");
    expect(buildFacts(EMPTY_REPORTS, plain)).not.toHaveProperty("sources");
  });
});

describe("the contract column's word", () => {
  const unmet = { contract_check: { state: "unmet", summary: "wrong kind" } };
  const met = { contract_check: { state: "met" } };
  it("is Mismatch when the default or any binding saved red", () => {
    expect(contractStateOf({ metadata: { default_holder_contract_check: { state: "unmet" } } }, [])).toBe("Mismatch");
    expect(contractStateOf({ metadata: {} }, [{ principal_type: "org", metadata: unmet }])).toBe("Mismatch");
  });
  it("is Matches only when a check was recorded, else Not checked", () => {
    expect(contractStateOf({ metadata: {} }, [{ metadata: met }])).toBe("Matches");
    expect(contractStateOf({ metadata: {} }, [])).toBe("Not checked");
  });
});

describe("every link in the new suite opens the new record page", () => {
  it("the name door and the row menu go to /administration/intelligence/mandates/<key>", () => {
    const row = { mandateKey: "podcast.script" } as never;
    expect(adminMandateListConfig.door?.hrefFor?.(row)).toBe(adminMandateRecordHref("podcast.script"));
    expect(adminMandateRecordHref("podcast.script")).toBe("/administration/intelligence/mandates/podcast.script");
  });

  it("dashboard tiles open the list filtered to mismatches, and unconverted filtered to waiting", () => {
    const mismatch = new URL(mandateListHref({ contractCheck: "Mismatch" }), "http://x");
    expect(mismatch.pathname).toBe("/administration/intelligence/mandates");
    expect(JSON.parse(mismatch.searchParams.get("filters") ?? "{}")).toEqual({
      contractCheck: { kind: "select", values: ["Mismatch"] },
    });
    const waiting = new URL(unconvertedCallsHref("waiting"), "http://x");
    expect(waiting.pathname).toBe("/administration/intelligence/mandates/unconverted");
    expect(JSON.parse(waiting.searchParams.get("filters") ?? "{}")).toEqual({
      status: { kind: "select", values: ["waiting"] },
    });
  });
});

describe("batch advance for workflow pins", () => {
  const base: WorkflowImpactVerdict = {
    holder_kind: "mandate_default",
    row_id: "d1",
    mandate_key: "seo.audit",
    principal_kind: "system",
    organization_id: null,
    subject_user_id: null,
    workflow_id: "w1",
    workflow_name: "Audit flow",
    pinned_version_id: "v1",
    pinned_version_number: 1,
    latest_version_id: "v2",
    latest_version_number: 2,
    grade: "green",
    blocker: null,
    set_aside_reason: null,
    findings: [],
    breaks: {},
    contract_broken: false,
    behind_latest: true,
  };

  it("moves a pinned rung that is behind a published version", () => {
    expect(workflowAdvanceEligibility(base).batchable).toBe(true);
  });

  it("refuses, with the reason, everything that cannot move", () => {
    expect(workflowAdvanceEligibility({ ...base, blocker: "tracks_latest" })).toMatchObject({ batchable: false });
    expect(workflowAdvanceEligibility({ ...base, latest_version_id: null }).why).toMatch(/no published version/);
    expect(workflowAdvanceEligibility({ ...base, behind_latest: false }).why).toMatch(/newest/);
    const theirs = { ...base, holder_kind: "binding" as const, principal_kind: "user" as const, subject_user_id: "someone" };
    expect(workflowAdvanceEligibility(theirs).why).toMatch(/person's own pin/);
    // THE ADMIN SEAT: even the signed-in admin's own pin is a person's pin.
    expect(workflowAdvanceEligibility({ ...theirs, subject_user_id: "me" }).batchable).toBe(false);
  });
});
