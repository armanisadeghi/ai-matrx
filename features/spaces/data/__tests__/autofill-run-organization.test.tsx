/**
 * @jest-environment jsdom
 */
// An AI autofill run is filed in the table's own organization (passed from the table record), never the active one.
import { act } from "react";
import { createRoot } from "react-dom/client";

const run = jest.fn();
jest.mock("@ai-matrx/chat/agents/hooks/useLiveAgentRun", () => ({ useLiveAgentRun: () => ({ run }) }));
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-mandates", () => ({ useDeclaredSurfaceMandates: () => undefined }));
jest.mock("@ai-matrx/design-system/controls", () => {
  const React = require("react");
  const Button = ({ children, onClick, disabled }: { children?: unknown; onClick?: () => void; disabled?: boolean }) => React.createElement("button", { onClick, disabled }, children);
  const Nil = () => null;
  return { Button, Field: Nil, Select: Nil, Textarea: Nil };
});
jest.mock("@/components/ui/dialog", () => ({ Dialog: () => null, DialogContent: () => null, DialogTitle: () => null }));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({ selectActiveOrganizationId: () => "active-org" }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "active-org" }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../../ai/spaces-ai", () => ({ AUTOFILL_KEY: "spaces.autofill" }));
jest.mock("../menu-parts", () => ({ MenuRow: () => null }));

import { AutofillRows } from "../ai-autofill";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("runs in the table's organization", async () => {
  run.mockResolvedValue("done");
  const client = {
    listPage: jest.fn().mockResolvedValue({ ok: true, data: { rows: [{ id: "r1", document: { name: "A" } }] } }),
    recordUpdate: jest.fn().mockResolvedValue({ ok: true }),
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <AutofillRows tableId="t1" databaseName="Clients" fields={[]} aiFields={[{ key: "ai_x", label: "Summary", kind: "summary" }]} client={client as never} organizationId="org-of-table" onAiFields={() => undefined} />,
    );
  });
  const fill = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Fill all")!;
  await act(async () => {
    fill.click();
  });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0].organizationId).toBe("org-of-table");
  act(() => root.unmount());
});
