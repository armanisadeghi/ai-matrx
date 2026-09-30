/**
 * An agent asks a member to approve an SEO keyword pull estimated at $0.29.
 * The member's form speaks POINTS end to end — estimate, cap, amount box,
 * heading — and never shows a dollar sign; the answer still carries USD.
 * (Arman, 2026-09-27: people see points; dollars only behind an admin's switch.)
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ usePathname: () => "/chat" }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { ActionRequestAnswerForm } from "../ActionRequestAnswerForm";
import type { ApproveSpendRender } from "../../service";

const RENDER: ApproveSpendRender = {
  __kind: "action_request.render",
  form: "approve_spend",
  // The server's own title — the form must not echo its dollars.
  title: "Approve up to $0.29?",
  subtitle: "Keyword volumes for allgreenrecycling.com",
  estimate_usd: 0.2831,
  amount_usd: 0.29,
  amount_editable: true,
  what_it_buys: "Search volume and difficulty for 120 recycling keywords",
  guardrail_cap_usd: 5,
  covers: "provider",
  scope: { tool: "seo_keywords", action: "volumes" },
  consequence_note: null,
  choices: [
    { value: "yes", label: "Approve this amount", tone: "primary" },
    { value: "no", label: "Don't spend", tone: "ghost" },
  ],
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("shows a member points everywhere and submits the USD the server records", async () => {
  const onSubmit = jest.fn();
  act(() => {
    root.render(
      <ActionRequestAnswerForm render={RENDER} busy={false} refusal={null} onSubmit={onSubmit} />,
    );
  });
  const text = host.textContent ?? "";
  expect(text).not.toContain("$");
  expect(text).toContain("Approve up to 5,800 points?");
  expect(text).toContain("5,662 points"); // the estimate
  expect(text).toContain("100,000 points"); // the organization's remaining limit
  const input = host.querySelector("input") as HTMLInputElement;
  expect(input.value).toBe("5800");

  const approve = [...host.querySelectorAll("button")].find((b) => b.textContent === "Approve this amount")!;
  await act(async () => approve.click());
  expect(onSubmit).toHaveBeenCalledWith({ result: { approved: true, approved_amount_usd: 0.29 } });
});
