/**
 * AGENTS-ON-DATA item 2 (walked live 2026-10-04, Cedar Ridge PT): asked to note a visit, the agent
 * needed a Notes column (card 1), then the row write (card 2), and after each Approve it sat still
 * until the person typed "go on". The card's admin read "admin can decide this." Now:
 *   - the person who can decide reads "You can decide this.";
 *   - in a chat the card offers "Also allow its other changes to this table in this chat", and
 *     Approve with it ticked trusts the agent with that table for that chat;
 *   - the decision is handed to the mounting surface (the chat tells the agent to carry on).
 */
import { expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const ME = "87a6e699-3622-4869-8843-d0867456c0dd";

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/records-ui", () => ({
  ...(jest.requireActual("@ai-matrx/records-ui") as object),
  recordsDataSource: () => ({
    rpc: async (name: string) =>
      name === "work_approval_read" ? { data: { state: "pending" }, error: null } : { data: null, error: null },
  }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => ME }));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/features/unified-data/objectOrganization", () => ({
  useObjectOrganization: () => ({ state: "found", organizationId: ORG }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@ai-matrx/chat/agents/ui-first-tools/ui/ApprovalCard", () => ({
  ApprovalCard: ({
    ask,
    onDecide,
    outcome,
    note,
  }: {
    ask: { approval?: { autoApprove?: { label?: string } } };
    onDecide: (d: "approve" | "decline", o?: { remember: boolean }) => void;
    outcome?: React.ReactNode;
    note?: React.ReactNode;
  }) =>
    outcome ? (
      <div data-testid="outcome">{outcome}</div>
    ) : (
      <div>
        <p data-testid="note">{note}</p>
        <p data-testid="trust">{ask.approval?.autoApprove?.label ?? ""}</p>
        <button type="button" onClick={() => onDecide("approve", { remember: true })}>
          Approve
        </button>
      </div>
    ),
}));
const applyApprovedRecordChange = jest.fn(async (..._args: unknown[]) => ({
  status: "applied" as const,
  recordId: "f-1",
  detail: "Notes is now a column on Visits.",
}));
jest.mock("../applyRecordChange", () => ({
  applyApprovedRecordChange: (...args: unknown[]) => applyApprovedRecordChange(...args),
  declineRecordChange: jest.fn(),
  tableNameFor: async () => "Visits",
}));

import captured from "@ai-matrx/chat/testing/captured/awaiting-approval";
import { readRecordChangeWait } from "../recordChangeApproval";
import { RecordChangeApprovalCard } from "../RecordChangeApprovalCard";

function theWait() {
  const read = readRecordChangeWait((captured as { approve: { result: unknown } }).approve.result)!;
  return {
    ...read,
    approvalId: "caa6e64e-4c32-4a21-a252-ba4be861c2a3",
    approvers: [{ userId: ME, name: "admin", why: "owner" }],
  };
}

async function render(props: { conversationId?: string; onDecided?: (d: { choice: string; sentence: string }) => void }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <RecordChangeApprovalCard wait={theWait()} callId="call-1" tableName="Visits" organizationId={ORG} {...props} />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

it("the person who can decide is told it is them, and the note is one sentence", async () => {
  const host = await render({ conversationId: "8c08e6ad-56d5-4a23-942a-637798ef7012" });
  expect(host.textContent).toContain("You can decide this.");
  expect(host.textContent).not.toContain("admin can decide this.");
  expect(host.querySelector('[data-testid="note"]')?.textContent).not.toContain("Never ask lets");
});

it("in a chat, Approve can trust the agent with this table for the rest of the chat, and the chat hears the decision", async () => {
  const decided: Array<{ choice: string; sentence: string }> = [];
  const host = await render({
    conversationId: "8c08e6ad-56d5-4a23-942a-637798ef7012",
    onDecided: (d) => decided.push(d),
  });
  expect(host.querySelector('[data-testid="trust"]')?.textContent).toBe(
    "Also allow its other changes to this table in this chat",
  );
  await act(async () => {
    host.querySelector("button")!.click();
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(applyApprovedRecordChange).toHaveBeenCalledWith(expect.anything(), { restOfChat: true });
  expect(decided).toEqual([{ choice: "approve", sentence: "Notes is now a column on Visits." }]);
});

it("outside a chat there is no rest-of-chat to allow", async () => {
  const host = await render({});
  expect(host.querySelector('[data-testid="trust"]')?.textContent).toBe("");
});
