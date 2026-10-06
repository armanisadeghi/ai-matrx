/**
 * A screen runs a paid tool action through `useToolAction`. The server answers
 * `needs_approval` with the approve_spend form; the hook shows THAT form in a
 * dialog, the person approves as themselves, and the hook calls the door again
 * carrying the approval the answer returned — then hands the screen the tool's
 * envelope. A decline spends nothing and makes no second call. A free call
 * returns its output with no dialog at all.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../../host/ui-slots", () => ({
  ...jest.requireActual("../../../host/ui-slots"),
  ErrorAlchemyMenu: () => null,
}));

const requestRaw = jest.fn();
jest.mock("../../../host/server/python-client", () => ({
  requestRaw: (...args: unknown[]) => requestRaw(...args),
}));

const completeActionRequestAsSelf = jest.fn();
jest.mock("../../self-service", () => ({
  completeActionRequestAsSelf: (...args: unknown[]) => completeActionRequestAsSelf(...args),
}));

import { registerChatUi, resetChatUiForTests } from "../../../host/ui-slots";
import { formatCost, usdToPoints } from "@ai-matrx/kit/format";
import { APPROVAL_OPEN_MESSAGE, useToolAction, type ToolActionOutcome } from "../useToolAction";
import { ENDPOINTS } from "@ai-matrx/agents/matrx";
import type { ToolEnvelope } from "../../screen-run";
import type { ApproveSpendRender } from "../../render-types";

const RATE = 20_000;
beforeAll(() => {
  registerChatUi({
    currentPointsRate: () => RATE,
    useCostDisplay: () => ({
      unit: "points",
      canToggle: false,
      rate: RATE,
      format: (usd: number | null | undefined, options?: object) =>
        formatCost(usd, { ...options, unit: "points", rate: RATE }),
      toPoints: (usd: number | null | undefined) => usdToPoints(usd, { rate: RATE }),
    }),
  });
});
afterAll(() => resetChatUiForTests());

const RENDER: ApproveSpendRender = {
  __kind: "action_request.render",
  form: "approve_spend",
  title: "Approve up to $2.50?",
  subtitle: null,
  estimate_usd: 2.5,
  amount_usd: 2.5,
  amount_editable: true,
  what_it_buys: "Volumes for 40 keywords",
  guardrail_cap_usd: 50,
  covers: "provider",
  scope: { tool: "seo_keywords", action: "research" },
  consequence_note: null,
  choices: [
    { value: "yes", label: "Approve this amount", tone: "primary" },
    { value: "no", label: "Don't spend", tone: "ghost" },
  ],
} as ApproveSpendRender;

const ENVELOPE: ToolEnvelope<{ keywords: number }> = {
  __kind: "seo.tool_envelope",
  status: "ok",
  data: { keywords: 40 },
  cost: { class: "paid", estimate_usd: 2.5, charged_usd: 2.41 },
};

const ok = (output: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({
    call_id: "call-2",
    tool_name: "seo_keywords",
    status: "ok",
    output,
    error: null,
    approval: null,
  }),
});
const NEEDS_APPROVAL = {
  ok: true,
  status: 200,
  json: async () => ({
    call_id: "call-1",
    tool_name: "seo_keywords",
    status: "needs_approval",
    output: null,
    error: null,
    approval: {
      action_request_id: "ar-1",
      organization_id: "org-ask",
      estimate_usd: 2.5,
      ceiling_cap_usd: 50,
      what_it_buys: "Volumes for 40 keywords",
      expires_at: null,
      render: RENDER,
    },
  }),
};

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as { body: string }).body);
}

let root: Root;
let host: HTMLDivElement;
let hook: ReturnType<typeof useToolAction<ToolEnvelope<{ keywords: number }>>>;
function Screen() {
  hook = useToolAction<ToolEnvelope<{ keywords: number }>>("seo_keywords");
  return <>{hook.approvalDialog}</>;
}

beforeEach(() => {
  requestRaw.mockReset();
  completeActionRequestAsSelf.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Screen />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent === label);

it("asks in place, then retries with the approval the answer returned", async () => {
  requestRaw.mockResolvedValueOnce(NEEDS_APPROVAL).mockResolvedValueOnce(ok(ENVELOPE));
  completeActionRequestAsSelf.mockResolvedValueOnce({
    status: 200,
    body: { state: "done", message: "Approved.", approved: true, spend_approval_id: "sa-9" },
  });

  let pending!: Promise<ToolActionOutcome<ToolEnvelope<{ keywords: number }>>>;
  await act(async () => {
    pending = hook.run({ action: "research", keywords: ["a"] });
  });

  // The SAME approve_spend form, in a dialog.
  const approve = button("Approve this amount");
  expect(approve).toBeDefined();
  await act(async () => approve!.click());
  const outcome = await act(async () => pending);

  expect(completeActionRequestAsSelf).toHaveBeenCalledWith(
    "ar-1",
    "org-ask",
    { result: { approved: true, approved_amount_usd: 2.5 } },
  );
  expect(requestRaw).toHaveBeenCalledTimes(2);
  expect(requestRaw.mock.calls[0][0]).toBe(ENDPOINTS.tools.screenRun);
  expect(bodyOf(requestRaw.mock.calls[0])).toEqual({
    tool_name: "seo_keywords",
    arguments: { action: "research", keywords: ["a"] },
  });
  expect(bodyOf(requestRaw.mock.calls[1])).toEqual({
    tool_name: "seo_keywords",
    arguments: { action: "research", keywords: ["a"] },
    spend_approval_id: "sa-9",
  });
  expect(outcome).toEqual({ status: "ok", output: ENVELOPE, callId: "call-2" });
  expect(button("Approve this amount")).toBeUndefined();
});

it("a decline spends nothing and makes no second call", async () => {
  requestRaw.mockResolvedValueOnce(NEEDS_APPROVAL);
  completeActionRequestAsSelf.mockResolvedValueOnce({
    status: 200,
    body: { state: "done", message: "Declined. Nothing was spent.", approved: false, spend_approval_id: null },
  });

  let pending!: Promise<ToolActionOutcome<unknown>>;
  await act(async () => {
    pending = hook.run({ action: "research" });
  });
  await act(async () => button("Don't spend")!.click());
  const outcome = await act(async () => pending);

  expect(outcome).toEqual({ status: "declined" });
  expect(requestRaw).toHaveBeenCalledTimes(1);
});

it("a free call returns its output with no dialog", async () => {
  requestRaw.mockResolvedValueOnce(ok(ENVELOPE));

  const outcome = await act(async () => hook.run({ action: "overview" }));

  expect(outcome).toEqual({ status: "ok", output: ENVELOPE, callId: "call-2" });
  expect(button("Approve this amount")).toBeUndefined();
  expect(completeActionRequestAsSelf).not.toHaveBeenCalled();
});

it("a tool the server will not run comes back as a typed error, not a throw", async () => {
  requestRaw.mockResolvedValueOnce({
    ok: false,
    status: 403,
    // aidream's real 403 body (error middleware), captured from the live route.
    json: async () => ({
      error: "tool_not_screen_callable",
      message: "Tool 'send_email' runs only inside an agent.",
      user_message: "You do not have permission to access this resource.",
      details: null,
      request_id: "r-1",
    }),
  });

  const outcome = await act(async () => hook.run({}));

  expect(outcome).toEqual({
    status: "error",
    error: {
      error_type: "tool_not_screen_callable",
      message: "Tool 'send_email' runs only inside an agent.",
      suggested_action: null,
    },
  });
});


it("a double click runs once and both clicks get the same answer", async () => {
  let release!: (v: unknown) => void;
  requestRaw.mockReturnValueOnce(new Promise((r) => (release = r)));

  let a!: Promise<ToolActionOutcome<unknown>>;
  let b!: Promise<ToolActionOutcome<unknown>>;
  await act(async () => {
    a = hook.run({ action: "overview", force_refresh: true, domain: "x.com" });
    // Same arguments, different key order: the same run.
    b = hook.run({ domain: "x.com", force_refresh: true, action: "overview" });
  });
  await act(async () => release(ok(ENVELOPE)));
  const [first, second] = await act(async () => Promise.all([a, b]));

  expect(requestRaw).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);
});

it("another run while an approval is open is refused, and the open ask keeps waiting", async () => {
  requestRaw.mockResolvedValueOnce(NEEDS_APPROVAL).mockResolvedValueOnce(ok(ENVELOPE));
  completeActionRequestAsSelf.mockResolvedValueOnce({
    status: 200,
    body: { state: "done", message: "Approved.", approved: true, spend_approval_id: "sa-9" },
  });

  let pending!: Promise<ToolActionOutcome<unknown>>;
  await act(async () => {
    pending = hook.run({ action: "research" });
  });
  const other = await act(async () => hook.run({ action: "overview" }));
  expect(other).toEqual({ status: "busy", message: APPROVAL_OPEN_MESSAGE });
  expect(requestRaw).toHaveBeenCalledTimes(1);

  await act(async () => button("Approve this amount")!.click());
  expect((await act(async () => pending)).status).toBe("ok");
});

it("closing the approval declines the ask so it is not left open", async () => {
  requestRaw.mockResolvedValueOnce(NEEDS_APPROVAL);
  completeActionRequestAsSelf.mockResolvedValue({
    status: 200,
    body: { state: "done", message: "Declined. Nothing was spent.", approved: false },
  });

  let pending!: Promise<ToolActionOutcome<unknown>>;
  await act(async () => {
    pending = hook.run({ action: "research" });
  });
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  const outcome = await act(async () => pending);

  expect(outcome).toEqual({ status: "dismissed" });
  expect(completeActionRequestAsSelf).toHaveBeenCalledWith("ar-1", "org-ask", {
    result: { approved: false },
  });
  expect(requestRaw).toHaveBeenCalledTimes(1);
});

it("an approval the server could not save shows the server's reason, not 'unreachable'", async () => {
  requestRaw.mockResolvedValueOnce(NEEDS_APPROVAL);
  completeActionRequestAsSelf.mockResolvedValueOnce({
    status: 500,
    body: {
      error: "internal_error",
      message: "Internal server error: CheckViolationError",
      user_message: "Something went wrong. Please try again later.",
    },
  });

  await act(async () => {
    void hook.run({ action: "research" });
  });
  await act(async () => button("Approve this amount")!.click());

  const text = document.body.textContent ?? "";
  expect(text).toContain("Internal server error: CheckViolationError");
  expect(text).not.toContain("did not reach us");
});
