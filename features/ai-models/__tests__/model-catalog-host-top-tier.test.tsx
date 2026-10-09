/**
 * The viewer's "Allow top-tier models" permission reaches the model picker through the one host
 * (providers/ModelCatalogHost.tsx): ON, a cost-rating-6 model can be picked; OFF (everyone else),
 * the same row is disabled and titled "limited to approved accounts". Real package picker, real
 * host, real selector; only the catalog's database client and the Redux state are stand-ins.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createModelCatalog, createModelFavorites } from "@ai-matrx/agents/models";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { TooltipProvider } from "@ai-matrx/design-system";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const CAPS = { input: ["text"], output: ["text"], features: [], interaction: "turn", multilingual: false };
const FABLE = "33333333-3333-4333-8333-333333333333";
const q = (result: unknown): any => {
  const o: any = { then: (ok: any, err: any) => Promise.resolve(result).then(ok, err), select: () => o, order: () => o, eq: () => o, maybeSingle: () => Promise.resolve(result) };
  return o;
};
const client: any = {
  rpc: () => Promise.resolve({ data: [], error: null }),
  schema: () => ({
    from: (t: string) =>
      q(
        t === "model_public"
          ? { data: [{ id: FABLE, name: "claude-fable-5-1", common_name: "Claude Fable 5.1", capabilities: CAPS, maker: "Anthropic", cost_rating: 6 }], error: null }
          : t === "model_offering"
            ? { data: [{ model_id: FABLE, offering_id: "o3", served_via: "Matrx Fast", served_via_endpoint_id: "e1", priority: 1 }], error: null }
            : { data: [], error: null },
      ),
  }),
};

let permissions: string[] = [];
jest.mock("@/lib/ai-models/modelCatalog", () => ({
  getModelCatalog: () => (globalThis as any).__catalog,
  getModelFavorites: () => (globalThis as any).__favorites,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ userAuth: { id: "u1", appMetadata: { permissions }, isAdmin: false }, userPreferences: {}, user: {} }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("next/link", () => ({ __esModule: true, default: (p: any) => <a {...p} /> }));

import { ModelCatalogHost } from "@/providers/ModelCatalogHost";

const click = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
async function until(fn: () => unknown) {
  for (let i = 0; i < 60; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    if (fn()) return;
  }
  throw new Error("picker never showed the model");
}
const fableRow = () => {
  const label = Array.from(document.body.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent === "Claude Fable 5.1");
  return (label?.closest("[role=button]") as HTMLElement | null) ?? null;
};

async function openPicker() {
  (globalThis as any).__catalog = createModelCatalog({ client });
  (globalThis as any).__favorites = createModelFavorites({ client });
  const onSelect = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ModelCatalogHost>
          <ModelListDropdown modelOnly value={null} inputModalities={["text"]} onValueChange={onSelect} />
        </ModelCatalogHost>
      </TooltipProvider>,
    );
  });
  await click(host.querySelector("button")!);
  await until(fableRow);
  return { onSelect, row: fableRow()!, unmount: () => act(async () => root.unmount()) };
}

describe("model picker given the viewer's top-tier permission", () => {
  it("OFF (everyone else): the top-tier row is disabled with the reason and cannot be picked", async () => {
    permissions = [];
    const { onSelect, row, unmount } = await openPicker();
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("title")).toBe("This model is limited to approved accounts");
    await click(row);
    expect(onSelect).not.toHaveBeenCalled();
    await unmount();
  });
  it("ON (an approved account): the same row is enabled and picks", async () => {
    permissions = ["models.top_tier"];
    const { onSelect, row, unmount } = await openPicker();
    expect(row.getAttribute("aria-disabled")).not.toBe("true");
    await click(row);
    expect(onSelect).toHaveBeenCalled();
    await unmount();
  });
});
