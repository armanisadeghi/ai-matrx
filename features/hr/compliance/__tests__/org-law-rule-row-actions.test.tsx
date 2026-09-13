import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { HrOrgLawRule } from "../../types";
import { OrgLawRuleRow } from "../LawRuleRow";

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

async function render(onEdit: () => void, onRetire: () => void): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<OrgLawRuleRow rule={RULE} busy={false} onEdit={onEdit} onRetire={onRetire} />);
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

describe("OrgLawRuleRow actions", () => {
  it("opens its own edit and retire paths without expanding the row", async () => {
    const onEdit = jest.fn();
    const onRetire = jest.fn();
    const container = await render(onEdit, onRetire);
    const expansion = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
    if (!expansion) throw new Error("Missing row expansion control");

    await act(async () => button(container, "Edit").click());
    await act(async () => button(container, "Retire").click());

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRetire).toHaveBeenCalledTimes(1);
    expect(expansion.getAttribute("aria-expanded")).toBe("false");

    await act(async () => expansion.click());
    expect(expansion.getAttribute("aria-expanded")).toBe("true");
  });
});
