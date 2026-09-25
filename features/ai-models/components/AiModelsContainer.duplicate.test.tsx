import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AiModelsContainer from "./AiModelsContainer";
import { aiModelService } from "../service";
import { toast } from "sonner";
import type { AiModel } from "../types";

let duplicate: (model: AiModel) => Promise<void>;
let rows: AiModel[] = [];
let refresh: () => Promise<void>;
const push = jest.fn();
jest.mock("./AiModelTable", () => ({ __esModule: true, default: (props: { models: AiModel[]; onDuplicate: typeof duplicate; onRefresh: typeof refresh }) => { refresh = props.onRefresh; duplicate = props.onDuplicate; rows = props.models; return null; } }));
jest.mock("./AiModelTabBar", () => ({ __esModule: true, default: () => null }));
jest.mock("./AiModelDetailPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("./DeprecatedModelsAudit", () => ({ __esModule: true, default: () => null }));
jest.mock("./ProviderReferenceModal", () => ({ __esModule: true, default: () => null }));
jest.mock("next/navigation", () => ({ usePathname: () => "/models", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) }));
jest.mock("../hooks/useTabUrlState", () => ({ useTabUrlState: () => ({ tabIds: ["all"], activeTabId: "all", tabStates: [], activeTab: { id: "all", q: "", filters: {} } }) }));
jest.mock("../service", () => ({ aiModelService: { fetchAll: jest.fn(), fetchProviders: jest.fn(), create: jest.fn() } }));
jest.mock("sonner", () => ({ toast: { loading: jest.fn(() => "notice"), success: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({ SurfaceRuntimeProvider: ({children}: {children: React.ReactNode}) => children }));
jest.mock("@/features/surfaces/manifests/admin-ai-models.manifest", () => ({ ADMIN_AI_MODELS_SURFACE_NAME: "models", createAdminAiModelsScope: jest.fn() }));
jest.mock("@/components/ui/resizable", () => ({ ResizablePanelGroup: ({children}: {children: React.ReactNode}) => children, ResizablePanel: ({children}: {children: React.ReactNode}) => children, ResizableHandle: () => null }));

// The table supplies the actual callback; requests are controlled at the service boundary.
const model = { id: "source", name: "model", common_name: "Model", is_primary: true, maker: "Provider", preferred_pricing: null } as AiModel;
it("blocks concurrent duplicate requests, reports failure, and permits a successful retry", async () => {
  jest.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.mocked(aiModelService.fetchAll).mockResolvedValue([model]);
  jest.mocked(aiModelService.fetchProviders).mockResolvedValue([]);
  let reject!: (error: Error) => void;
  jest.mocked(aiModelService.create).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<AiModelsContainer />));
    await act(async () => { jest.runOnlyPendingTimers(); });
    let first!: Promise<void>;
    await act(async () => { first = duplicate(model); await duplicate(model); });
    expect(aiModelService.create).toHaveBeenCalledTimes(1);
    expect(toast.loading).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("Network unavailable")); await first; });
    expect(toast.error).toHaveBeenCalledWith("Could not duplicate model", { id: "notice", description: "Network unavailable" });
    expect(rows).toHaveLength(1);
    const created = { ...model, id: "copy", name: "model-copy", common_name: "Model (Copy)", is_primary: false };
    jest.mocked(aiModelService.create).mockResolvedValueOnce(created);
    await act(async () => { await duplicate(model); });
    expect(aiModelService.create).toHaveBeenCalledTimes(2);
    expect(aiModelService.create).toHaveBeenLastCalledWith({ name: "model-copy", common_name: "Model (Copy)", is_primary: false });
    expect(rows.map(row => row.id)).toEqual(["copy", "source"]);
    expect(toast.success).toHaveBeenCalledWith("Model duplicated", { id: "notice" });
    // Opening the copy is a history push through lib/url-state's door, not a navigation.
    expect(new URLSearchParams(window.location.search).get("model")).toBe("copy");
    expect(push).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    errorLog.mockRestore();
    jest.useRealTimers();
  }
});

it("shows a persistent catalog failure and recovers through Retry", async () => {
  jest.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.mocked(aiModelService.fetchAll).mockRejectedValueOnce(new Error("offline")).mockResolvedValue([model]);
  jest.mocked(aiModelService.fetchProviders).mockResolvedValue([]);
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AiModelsContainer />));
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not load the model catalog");
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Retry");
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(rows.map(row => row.id)).toEqual(["source"]);
  } finally {
    await act(async () => root.unmount());
    errorLog.mockRestore();
    jest.useRealTimers();
  }
});

it("keeps the latest refresh result when an older request finishes later", async () => {
  jest.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.mocked(aiModelService.fetchAll).mockResolvedValue([model]);
  jest.mocked(aiModelService.fetchProviders).mockResolvedValue([]);
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<AiModelsContainer />));
    await act(async () => { jest.runOnlyPendingTimers(); });
    let resolveOld!: (rows: AiModel[]) => void;
    jest.mocked(aiModelService.fetchAll).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    let oldRequest!: Promise<void>;
    await act(async () => { oldRequest = refresh(); });
    jest.mocked(aiModelService.fetchAll).mockResolvedValueOnce([{ ...model, id: "latest" }]);
    await act(async () => { await refresh(); });
    await act(async () => { resolveOld([{ ...model, id: "stale" }]); await oldRequest; });
    expect(rows.map(row => row.id)).toEqual(["latest"]);
  } finally {
    await act(async () => root.unmount());
    jest.useRealTimers();
  }
});
