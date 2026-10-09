/** @jest-environment jsdom */

/**
 * The new agents table shows each agent's Agent Factory proof status (Unproven / Proven /
 * Failed proof) — the badge the classic views carry (Agent Factory R59). A column that
 * is declared but renders nothing for a status would pass a shape-only check, so this
 * renders the real cell for each status.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { BROWSE_COLUMNS } from "../columns";
import type { AgentBrowseRow } from "../types";

const status = { current: null as "unproven" | "proven" | "failed_proof" | null };
jest.mock("@/features/agents/factory/proof-status", () => ({
  useAgentProofStatus: () => status.current,
}));

const proofColumn = BROWSE_COLUMNS.find((c) => c.id === "proof");
const row = { id: "860b7553-e9b8-40fc-932f-66d27916a699" } as AgentBrowseRow;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderCell(): string {
  const cell = proofColumn?.column.cell as ((r: AgentBrowseRow) => React.ReactNode) | undefined;
  expect(cell).toBeDefined();
  const host = document.createElement("div");
  act(() => {
    createRoot(host).render(<>{cell!(row)}</>);
  });
  return host.textContent ?? "";
}

describe("agents table proof column", () => {
  it("is declared and visible by default", () => {
    expect(proofColumn).toBeDefined();
    expect(proofColumn?.defaultHidden).not.toBe(true);
  });

  it.each([
    ["unproven", "Unproven"],
    ["proven", "Proven"],
    ["failed_proof", "Failed proof"],
  ] as const)("shows %s as %s", (value, label) => {
    status.current = value;
    expect(renderCell()).toBe(label);
  });

  it("shows nothing for an agent that was never saved unproven", () => {
    status.current = null;
    expect(renderCell()).toBe("");
  });
});
