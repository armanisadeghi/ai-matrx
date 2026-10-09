/**
 * The Code page's default is the owner's view — the Applet and "Change it by talking" (the builder) —
 * never the developer IDE: no file tree, no "typescript" status bar, no terminal, no ".tsx" names.
 * The code workspace mounts only after the explicit "Show code".
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let search = "";
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/applets/manage/app-1/code",
}));
jest.mock("@/features/applets-host/builder/AppletBuilder", () => ({
  AppletBuilder: ({ appletId }: { appletId: string }) => (
    <div data-testid="builder">Builder for {appletId}: preview + Change it by talking</div>
  ),
}));
// What the IDE draws, so the test can see whether it mounted.
jest.mock("@/features/code/host/CodeWorkspaceRoute", () => ({
  CodeWorkspaceRoute: () => <div data-testid="ide">Explorer App.tsx typescript Terminal Live buffer</div>,
}));
jest.mock("@/features/code/chat/ChatPanelSlot", () => ({ ChatPanelSlot: () => null }));
jest.mock("@/features/code/hooks/useOpenSourceEntry", () => ({ useOpenSourceEntry: () => async () => undefined }));
jest.mock("@/features/code/hooks/useOpenRenderPreview", () => ({ useOpenRenderPreview: () => () => undefined }));
jest.mock("@/features/code/library-sources/adapters/aga-apps", () => ({
  agaAppsAdapter: { sourceId: "aga-apps", makeTabId: (id: string, f: string) => `${id}:${f}` },
}));
jest.mock("@/features/applets/code-preview/registerAppletSourcePreview", () => ({}));
jest.mock("@/features/code/redux/terminalSlice", () => ({ setOpen: (v: boolean) => ({ type: "t", payload: v }) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({ codeTabs: { byId: {} } }) }),
}));
jest.mock("@ai-matrx/chat/mandates/useMandate", () => ({ useMandate: () => ({ mandate: { agentId: "agent-1" } }) }));
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-mandates", () => ({ useDeclaredSurfaceMandates: () => undefined }));
jest.mock("@ai-matrx/agents/mandates", () => ({ MANDATE_KEYS: { agent_apps__prompt_app_dev: "agent_apps.prompt_app_dev" } }));
jest.mock("@ai-matrx/design-system/controls", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

import { AppletEditPageClient } from "./AppletEditPageClient";
import type { AppletRow } from "@/features/applets/types";

const app = { id: "app-1", entry: "App.tsx", name: "Guest list" } as unknown as AppletRow;

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AppletEditPageClient app={app} />);
  });
  return { container, root };
}

it("opens on the Applet and Change it by talking — no IDE words", async () => {
  search = "";
  const { container, root } = await mount();
  const text = container.textContent ?? "";
  expect(container.querySelector('[data-testid="builder"]')).not.toBeNull();
  expect(text).toContain("Change it by talking");
  expect(text.toLowerCase()).not.toContain("typescript");
  expect(text.toLowerCase()).not.toContain("terminal");
  expect(text).not.toContain(".tsx");
  expect(container.querySelector('[data-testid="ide"]')).toBeNull();
  await act(async () => root.unmount());
});

it("shows the code only after Show code", async () => {
  search = "";
  const { container, root } = await mount();
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Show code");
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
  expect(container.querySelector('[data-testid="ide"]')).not.toBeNull();
  expect(window.location.search).toContain("show=code");
  await act(async () => root.unmount());
});

it("a refresh with ?show=code stays in the code", async () => {
  search = "show=code";
  const { container, root } = await mount();
  expect(container.querySelector('[data-testid="ide"]')).not.toBeNull();
  await act(async () => root.unmount());
});
