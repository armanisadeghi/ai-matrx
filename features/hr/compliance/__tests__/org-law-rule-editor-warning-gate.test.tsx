import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const saveHrOrgLawRule = jest.fn();

jest.mock("../../service", () => ({
  readHrLawValidation: (value: { validation?: unknown }) => value.validation ?? null,
  saveHrOrgLawRule: (...args: unknown[]) => saveHrOrgLawRule(...args),
}));

jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn() } }));

import { OrgLawRuleEditor } from "../OrgLawRuleEditor";
import type { HrLawRuleClass, HrOrgLawRule } from "../../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RULE = {
  id: "d4d50335-7b08-4d9c-9bd3-c8dd2fcc08fc",
  rule_class: "rounding-bounds",
  rule_class_label: "Rounding bounds",
  jurisdiction_key: "US-CA",
  jurisdiction_name: "California",
  effective_from: "2026-09-13",
  effective_to: null,
  status: "active",
  basis: null,
  citation: null,
  parameters: { max_increment_minutes: 15, allowed_modes: ["nearest"] },
  applicability: [],
  version: 1,
} satisfies HrOrgLawRule;

const CLASSES = [{
  id: "ca9950c3-3fd1-42d7-a4ea-b15dd0ca20dc",
  slug: "rounding-bounds",
  label: "Rounding bounds",
  description: "Neutral rounding only.",
  org_configurable: "more_generous_only" as const,
  produces_money: false,
  parameter_schema: { type: "object" },
}] satisfies HrLawRuleClass[];

async function render(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <OrgLawRuleEditor
        organizationId="2643e470-b275-47f3-95f3-ae275ad3ca47"
        classes={CLASSES}
        jurisdictions={[{ key: "US-CA", name: "California" }]}
        rule={RULE}
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
  });
  return container;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing ${label} control`);
  return match as HTMLButtonElement;
}

describe("OrgLawRuleEditor advisory acknowledgement", () => {
  beforeEach(() => saveHrOrgLawRule.mockReset());

  it("does not let an edit persist until the current Save anyway click", async () => {
    saveHrOrgLawRule
      .mockResolvedValueOnce({
        ok: false,
        kind: "denied",
        reason: "warnings_unacknowledged",
        detail: null,
        auditId: null,
        validation: { warnings: [{ code: "increment_exceeds_unverified_bound", message: "Review CA." }] },
      })
      .mockResolvedValueOnce({ ok: true, data: { rule_id: RULE.id } });
    const container = await render();
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea[aria-label='Rule parameters as JSON']");
    if (!textarea) throw new Error("Missing JSON editor");

    await act(async () => {
      textarea.value = '{"max_increment_minutes":10,"allowed_modes":["nearest"]}';
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      button(container, "Save changes").click();
      await Promise.resolve();
    });

    expect(saveHrOrgLawRule).toHaveBeenLastCalledWith(expect.objectContaining({ acceptWarnings: false }));
    expect(container.textContent).toContain("Nothing has been saved yet.");

    await act(async () => {
      button(container, "Save anyway").click();
      await Promise.resolve();
    });
    expect(saveHrOrgLawRule).toHaveBeenLastCalledWith(expect.objectContaining({ acceptWarnings: true }));
    expect(saveHrOrgLawRule).toHaveBeenCalledTimes(2);
  });

  it("keeps a normal server refusal on the first, unacknowledged save", async () => {
    saveHrOrgLawRule.mockResolvedValueOnce({
      ok: false,
      kind: "denied",
      reason: "unlawful_configuration",
      detail: null,
      auditId: null,
      validation: { violations: [{ code: "increment_exceeds_bound", message: "Lower the value." }] },
    });
    const container = await render();
    await act(async () => {
      button(container, "Save changes").click();
      await Promise.resolve();
    });

    expect(saveHrOrgLawRule).toHaveBeenCalledWith(expect.objectContaining({ acceptWarnings: false }));
    expect(container.textContent).toContain("Nothing was saved");
  });
});
