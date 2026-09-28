/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). In Cedar Ridge Physical Therapy's chat the assistant
 * held a Patient Capacity column for approval; admin approved it. Reopening the chat drew the same
 * card with Approve and Refuse live, and pressing Approve answered "That was already approved" —
 * the card read the tool result ("held", forever) and never the approval row. The card now reads
 * the row's standing and says what was decided, with no buttons.
 */
import { expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
let rowState: { state: string; decided_at?: string } = { state: "approved", decided_at: "2026-09-28T01:23:12.271Z" };

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/records-ui", () => ({
  ...(jest.requireActual("@ai-matrx/records-ui") as object),
  recordsDataSource: () => ({
    rpc: async (name: string) =>
      name === "work_approval_read" ? { data: rowState, error: null } : { data: null, error: null },
  }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => ORG }));
jest.mock("@/features/unified-data/objectOrganization", () => ({
  useObjectOrganization: () => ({ state: "found", organizationId: ORG }),
}));
jest.mock("@/lib/knobs/useUnifiedDataCampaignGate", () => ({ useUnifiedDataCampaign: () => ({ on: true, because: "" }) }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/agents/ui-first-tools/ui/ApprovalCard", () => ({
  ApprovalCard: ({ outcome }: { outcome?: React.ReactNode }) =>
    outcome ? <div data-testid="outcome">{outcome}</div> : <button type="button">Approve</button>,
}));
jest.mock("../applyRecordChange", () => ({
  applyApprovedRecordChange: jest.fn(),
  declineRecordChange: jest.fn(),
  tableNameFor: async () => "Treatment Rooms",
}));

import captured from "./fixtures/awaiting-approval.captured.json";
import { readRecordChangeWait } from "../recordChangeApproval";
import { RecordChangeApprovalCard } from "../RecordChangeApprovalCard";

async function render(): Promise<HTMLDivElement> {
  // The approval the Patient Capacity card was filed as (the capture predates queue ids).
  const wait = { ...readRecordChangeWait((captured as { approve: { result: unknown } }).approve.result)!, approvalId: "d3f01614-3e73-45a8-b40c-df67ee9ca1c4" };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<RecordChangeApprovalCard wait={wait} callId="call-1" tableName="Treatment Rooms" organizationId={ORG} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

it("a change somebody already approved says so and offers no Approve", async () => {
  rowState = { state: "approved", decided_at: "2026-09-28T01:23:12.271Z" };
  const host = await render();
  expect(host.textContent).toMatch(/^Approved on .+\. The change was made\./);
  expect(host.textContent).not.toMatch(/2026-09-28T/);
  expect(host.querySelector("button")).toBeNull();
});

it("a change still waiting keeps its buttons", async () => {
  rowState = { state: "pending" };
  const host = await render();
  expect(host.querySelector("button")?.textContent).toBe("Approve");
});
