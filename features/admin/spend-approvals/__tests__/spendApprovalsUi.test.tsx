/**
 * Spend approvals UI: the "Under $N" label follows the subject's organization threshold, and the
 * waiting-count slot is the same size before, during and after its fetch (no layout shift).
 *
 * Breaks named: a hard-coded "Under $1" for an org that lowered its threshold; a count that
 * renders nothing until it resolves (the pill pops in and shifts its neighbours).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock("@ai-matrx/design-system/controls", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { RunApprovalCell } from "../RunApprovalCell";
import { WaitingApprovalsCount } from "../WaitingApprovalsCount";
import { underThresholdLabel } from "../spendApprovals";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG_LOW = "11111111-1111-4111-8111-111111111111";
const ORG_DEFAULT = "22222222-2222-4222-8222-222222222222";

let countGate: Promise<void>;
let openCountGate: () => void;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  rpc.mockReset();
  countGate = new Promise<void>((r) => { openCountGate = r; });
  rpc.mockImplementation(async (fn: string, args: { p_org?: string }) => {
    if (fn === "run_approval_status") return { data: [], error: null };
    if (fn === "_run_approval_threshold") return { data: args.p_org === ORG_LOW ? 0.5 : 1, error: null };
    if (fn === "run_approval_waiting_count") return countGate.then(() => ({ data: 3, error: null }));
    return { data: null, error: null };
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

test("label formats the threshold", () => {
  expect(underThresholdLabel(1)).toBe("Under $1");
  expect(underThresholdLabel(0.5)).toBe("Under $0.5");
  expect(underThresholdLabel(2.25)).toBe("Under $2.25");
});

test("an org that lowered its threshold sees its own number, not $1", async () => {
  await act(async () => {
    root.render(<RunApprovalCell orgId={null} thresholdOrgId={ORG_LOW} subjects={[["agent", "a1"]]} maxRunCost={0.4} seat="admin" />);
  });
  await settle();
  expect(host.textContent).toBe("Under $0.5");
});

test("default-threshold org sees Under $1; a run above the org's threshold shows no label", async () => {
  await act(async () => {
    root.render(<RunApprovalCell orgId={null} thresholdOrgId={ORG_DEFAULT} subjects={[["agent", "a1"]]} maxRunCost={0.4} seat="admin" />);
  });
  await settle();
  expect(host.textContent).toBe("Under $1");
  await act(async () => {
    root.render(<RunApprovalCell orgId={null} thresholdOrgId={ORG_LOW} subjects={[["agent", "a1"]]} maxRunCost={0.9} seat="admin" />);
  });
  await settle();
  expect(host.textContent).toBe("—");
});

test("the waiting-count slot has the same width class before and after the count arrives", async () => {
  await act(async () => {
    root.render(<WaitingApprovalsCount orgId={null} />);
  });
  const slot = () => host.querySelector('[data-testid="waiting-approvals-slot"]') as HTMLElement;
  const width = (el: HTMLElement) => el.className.match(/\bw-\d+\b/)?.[0];
  const before = width(slot());
  expect(before).toBeTruthy();
  expect(slot().textContent).toBe("");
  openCountGate();
  await settle();
  expect(slot().textContent).toBe("3");
  expect(width(slot())).toBe(before);
});
