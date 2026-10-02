/**
 * The compare's "System items" line (lane CONTEXT-VALUES-NAMED): what the
 * server said was named, by what, and which side delivered it. Payloads are the
 * shape aidream's compare returns (context_compare.system_items_line) for the
 * live "Agent Structure Builder" agent over AI Matrx → Matrx Frontend.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SystemItemsLine } from "./SystemItemsLine";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(items: Parameters<typeof SystemItemsLine>[0]["items"]) {
  act(() => root.render(<SystemItemsLine items={items} />));
  return host;
}

it("says none was delivered when no agent and no pick named one, and lists what was held back", () => {
  const view = mount({
    named: [],
    withheld: ["current_date", "current_datetime", "ai_models_guidance", "ama_guides", "company_name"],
    says: "No System item was delivered: nothing named one.",
  });
  expect(view.querySelector("[data-compare-system-items]")?.getAttribute("data-compare-system-items")).toBe("0");
  expect(view.textContent).toContain("None delivered — nothing named one.");
  expect(view.textContent).toContain("5 unnamed System items were not fed and not evaluated");
  expect(view.textContent).toContain("ai_models_guidance");
});

it("names each delivered item, who named it, and that both sides delivered it", () => {
  const view = mount({
    named: [
      {
        key: "ai_models_guidance",
        context_item_id: "0340dfe8-372c-425d-aed4-08c8a5753088",
        named_by: ["the agent's variable model_selection_guidance"],
        old: true,
        new: true,
      },
      { key: "current_date", context_item_id: null, named_by: ["the platform's default list"], old: true, new: true },
    ],
    withheld: ["company_name"],
    says: "",
  });
  const rows = Array.from(view.querySelectorAll("[data-system-item]")).map((r) => r.textContent);
  expect(rows).toEqual([
    "ai_models_guidance — named by the agent's variable model_selection_guidance · both sides",
    "current_date — named by the platform's default list · both sides",
  ]);
  expect(view.textContent).toContain("1 unnamed System item was not fed and not evaluated: company_name.");
});

it("renders nothing when the server sent no line (an older server)", () => {
  const view = mount(undefined);
  expect(view.querySelector("[data-compare-system-items]")).toBeNull();
});
