import { renderToStaticMarkup } from "react-dom/server";
import type { MandateDefinitionRow } from "@/lib/supabase/mandateStorage";
import { MandateInputsCell, MandateOutputCell } from "../mandate-contract-cells";
import type { MandateRow } from "../mandate-health";

const LONG_OUTPUT_KIND =
  "resale_intelligence_report_with_an_exceptionally_long_variant";

const mandate: MandateDefinitionRow = {
  accepts_user_input: true,
  auto_context_disabled: false,
  code_path: null,
  created_at: "2026-08-29T00:00:00.000Z",
  created_by: null,
  default_holder_id: null,
  default_holder_type: "agent",
  default_holder_version_id: null,
  deleted_at: null,
  description: null,
  draft_inputs: {},
  fallback_mandate_key: null,
  goal: "Test wrapped output kind",
  goal_grounding: "test",
  id: "mandate-1",
  input_source: null,
  input_waiver: null,
  is_enabled: true,
  label: "Wrapped output test",
  mandate_key: "test.wrapped_output",
  metadata: {},
  organization_id: "organization-1",
  origin: "code",
  output_kind: LONG_OUTPUT_KIND,
  output_waiver: null,
  pinned_context: {},
  pins: {},
  provision_key: null,
  required_context_policies: [],
  required_output_keys: [],
  updated_at: "2026-08-29T00:00:00.000Z",
  updated_by: null,
  version: 1,
  visibility: "public",
};

const row: MandateRow = {
  mandate,
  id: mandate.id,
  mandateKey: mandate.mandate_key,
  feature: "test",
  mandateName: "wrapped_output",
  label: mandate.label,
  agentId: null,
  agentName: "Test agent",
  agentType: null,
  pinnedVersionNumber: null,
  latestVersion: null,
  pinLabel: "latest",
  drift: null,
  health: "ok",
  codeTruth: null,
  inputKind: "text",
  outputKind: LONG_OUTPUT_KIND,
  requiredVariables: [],
  provisionKey: null,
  draftInputDescriptions: [],
  holderDeclarations: [],
  requiredContextPolicyKeys: [],
  contextGateClosed: false,
  holderContextClosed: false,
  contextClosedEffective: false,
  requiredOutputKeys: [],
  inputSummary: "user text only",
  outputSummary: LONG_OUTPUT_KIND,
  overridesCount: 0,
  isEnabled: true,
  isPlaceholder: false,
  updatedAt: mandate.updated_at,
};

describe("MandateOutputCell", () => {
  it("lets a wrapped output-kind badge grow with every line", () => {
    const markup = renderToStaticMarkup(<MandateOutputCell row={row} />);

    expect(markup).toContain(LONG_OUTPUT_KIND);
    expect(markup).toContain("h-auto");
    expect(markup).toContain("min-h-5");
    expect(markup).toContain("whitespace-normal");
    expect(markup).toContain("[overflow-wrap:anywhere]");
    expect(markup).toContain("leading-tight");
    expect(markup).not.toMatch(/class="[^"]*(?:^|\s)h-5(?:\s|$)/);
  });

  it("keeps secondary foreground contrast when the output-kind badge is hovered", () => {
    const markup = renderToStaticMarkup(<MandateOutputCell row={row} />);

    expect(markup).toContain("hover:bg-secondary/80");
    expect(markup).toContain("hover:text-secondary-foreground");
    expect(markup).not.toContain("hover:bg-accent");
  });
});

/**
 * THE REGRESSION THIS FILE EXISTS TO HOLD (2026-08-29). `required_variables` is
 * stripped for every mandate that declares a Provision, so a cell reading only
 * that field announced "user text only" on exactly the mandates with the
 * richest, fully typed input declarations. Each case below FAILS against the
 * pre-fix cell.
 */
describe("MandateInputsCell reads the Provision, not required_variables", () => {
  const provisioned: MandateRow = {
    ...row,
    requiredVariables: [],
    provisionKey: "education.convert_source",
  };

  it("renders the offered value names when the offer has loaded", () => {
    const html = renderToStaticMarkup(
      <MandateInputsCell
        row={provisioned}
        offeredValues={["source_content", "title", "depth"]}
      />,
    );
    expect(html).toContain("source_content");
    expect(html).toContain("depth");
    expect(html).not.toContain("user text only");
  });

  it("names the provision rather than lying while the offer is still loading", () => {
    const html = renderToStaticMarkup(<MandateInputsCell row={provisioned} />);
    expect(html).toContain("education.convert_source");
    expect(html).not.toContain("user text only");
  });

  it("still says user text only when there is genuinely no input declaration", () => {
    const html = renderToStaticMarkup(<MandateInputsCell row={row} />);
    expect(html).toContain("user text only");
  });

  /**
   * THE SECOND HALF OF THE SAME LIE (found live by Arman, 2026-08-31). He
   * authored a mandate at /administration/mandates/new with five described
   * inputs, picked an output kind and bound an agent — and this cell still
   * said "user text only", because a user-authored mandate has neither a
   * contract nor a Provision. Both cases below FAIL against the pre-fix cell.
   */
  it("renders the mandate's OWN described inputs instead of claiming user text only", () => {
    const described: MandateRow = {
      ...row,
      draftInputDescriptions: [
        "Task overview",
        "Inputs",
        "Outputs",
        "System prompt",
        "Full agent object",
      ],
    };
    const html = renderToStaticMarkup(<MandateInputsCell row={described} />);
    expect(html).toContain("Task overview");
    expect(html).toContain("System prompt");
    expect(html).not.toContain("user text only");
  });

  it("falls back to what the BOUND AGENT declares before it claims user text only", () => {
    const held: MandateRow = {
      ...row,
      holderDeclarations: ["topic", "tone", "workspace_context"],
    };
    const html = renderToStaticMarkup(<MandateInputsCell row={held} />);
    expect(html).toContain("topic");
    expect(html).toContain("workspace_context");
    expect(html).not.toContain("user text only");
  });

  it("prefers the mandate's own described inputs over the agent's declarations", () => {
    const both: MandateRow = {
      ...row,
      draftInputDescriptions: ["Task overview"],
      holderDeclarations: ["topic"],
    };
    const html = renderToStaticMarkup(<MandateInputsCell row={both} />);
    expect(html).toContain("Task overview");
    expect(html).not.toContain("topic");
  });
});
