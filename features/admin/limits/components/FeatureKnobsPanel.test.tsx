/** Regression: the old `[settings]` effect dependency reloaded counts after its
 * own refresh. These mount the real panel and exercise its async boundaries. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fetchCounts = jest.fn();
let directive: (() => void) | null = null;
const refresh = jest.fn();

jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobOverrideCounts: (...args: unknown[]) => fetchCounts(...args) }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({ registerDirectiveHandler: (_: string, handler: () => void) => { directive = handler; return () => { directive = null; }; } }));
jest.mock("@/features/settings/universal/UniversalSettingsContext", () => ({
  UniversalSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useUniversalSettings: () => ({ isLoading: false, error: null, knobs: [], refresh }),
}));
jest.mock("@/features/settings/universal/UniversalSettingsPane", () => ({ UniversalSettingsRows: () => null }));
jest.mock("@/components/official/settings/SettingsDesignProvider", () => ({ SettingsDesignProvider: ({ children }: { children: React.ReactNode }) => children }));

import { FeatureKnobsPanel } from "./FeatureKnobsPanel";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("FeatureKnobsPanel count refresh", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { fetchCounts.mockReset(); refresh.mockReset(); directive = null; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("settles after one mounted count request instead of refreshing itself", async () => {
    fetchCounts.mockResolvedValue([]);
    await act(async () => { root.render(<FeatureKnobsPanel />); });
    expect(fetchCounts).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.resolve(); });
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });

  it("refreshes counts once when the settings directive arrives", async () => {
    fetchCounts.mockResolvedValue([]);
    await act(async () => { root.render(<FeatureKnobsPanel />); });
    await act(async () => { directive?.(); });
    expect(fetchCounts).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a count read failure", async () => {
    fetchCounts.mockRejectedValue(new Error("count door refused"));
    await act(async () => { root.render(<FeatureKnobsPanel />); await Promise.resolve(); });
    expect(container.textContent).toContain("count door refused");
  });

  it("ignores a count response that arrives after unmount", async () => {
    const pending = deferred<[]>();
    fetchCounts.mockReturnValue(pending.promise);
    await act(async () => { root.render(<FeatureKnobsPanel />); });
    act(() => root.unmount());
    await act(async () => { pending.resolve([]); await Promise.resolve(); });
    expect(container.textContent).toBe("");
  });
});
