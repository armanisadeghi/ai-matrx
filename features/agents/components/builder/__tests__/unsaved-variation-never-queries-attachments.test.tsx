/**
 * A `cmp-` variation (Agent Battle → Variations) mounts the full builder. Its
 * Resources and Term lists rows used to ask the association service for edges
 * on the synthetic id, which the service refuses ("targetIds[0] must be a
 * UUID") — two error toasts every time a variation opened (2026-09-26). The
 * rows must not query at all for an unsaved agent, and must say what to do.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

const listForTargetsVisible = jest.fn(async () => ({ data: { edges: [] } }));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { listForTargetsVisible: (...a: unknown[]) => listForTargetsVisible(...(a as [])) },
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { AgentTermListsManager } from "../AgentTermListsManager";
import { AgentResourcesManager } from "../AgentResourcesManager";

const SYNTHETIC = "cmp-49237e2a-7762-408d-a6b6-4eba03ff2772";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => listForTargetsVisible.mockClear());

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(node);
  });
  return host;
}

it("term lists row on an unsaved variation asks nothing and says to save first", async () => {
  const host = await mount(<AgentTermListsManager agentId={SYNTHETIC} />);
  expect(listForTargetsVisible).not.toHaveBeenCalled();
  expect(host.textContent).toMatch(/Save as agent/);
});

it("resources row on an unsaved variation asks nothing and says to save first", async () => {
  const host = await mount(<AgentResourcesManager agentId={SYNTHETIC} />);
  expect(listForTargetsVisible).not.toHaveBeenCalled();
  expect(host.textContent).toMatch(/Save as agent/);
});
