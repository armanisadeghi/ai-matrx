/** Regression: the old `[settings]` effect dependency reloaded counts after its
 * own refresh. These mount the real panel and exercise its async boundaries. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fetchCounts = jest.fn();
let directive: (() => void) | null = null;
const refresh = jest.fn();
let knobs: Array<Record<string, unknown>> = [];
let searchParams = new URLSearchParams();
const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobOverrideCounts: (...args: unknown[]) => fetchCounts(...args) }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({ registerDirectiveHandler: (_: string, handler: () => void) => { directive = handler; return () => { directive = null; }; } }));
jest.mock("@/features/settings/universal/UniversalSettingsContext", () => ({
  UniversalSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useUniversalSettings: () => ({ isLoading: false, error: null, knobs, refresh }),
}));
jest.mock("@/features/settings/universal/UniversalSettingsPane", () => ({
  // The real rows need the whole settings provider; what these tests assert is
  // WHICH keys reach them, so the stub prints exactly that.
  UniversalSettingsRows: ({ knobs: rows }: { knobs: Array<{ full_key: string }> }) => (
    <ul>{rows.map((row) => <li key={row.full_key}>{row.full_key}</li>)}</ul>
  ),
}));
jest.mock("@/components/official/settings/SettingsDesignProvider", () => ({ SettingsDesignProvider: ({ children }: { children: React.ReactNode }) => children }));

import { FeatureKnobsPanel } from "./FeatureKnobsPanel";

describe("FeatureKnobsPanel count refresh", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { fetchCounts.mockReset(); refresh.mockReset(); replace.mockReset(); directive = null; knobs = []; searchParams = new URLSearchParams(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
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
});

/** A register of ~880 rows is unusable without these three. */
const KNOB_FIXTURE = [
  { full_key: "orchestration.loop_guard.failure_threshold", feature: "orchestration.loop_guard", label: "Failed tool calls before the guard acts", description: "", ui: {}, set_by: "agent", review_due: null },
  { full_key: "orchestration.loop_guard.window_size", feature: "orchestration.loop_guard", label: "Tool-failure window", description: "", ui: {}, set_by: "human", review_due: null },
  { full_key: "tools.result_gate.soft_cap_chars", feature: "tools.result_gate", label: "Largest tool result an agent sees at once", description: "", ui: {}, set_by: "human", review_due: null },
];

describe("FeatureKnobsPanel register affordances", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { fetchCounts.mockResolvedValue([]); knobs = [...KNOB_FIXTURE]; searchParams = new URLSearchParams(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const mount = async () => { await act(async () => { root.render(<FeatureKnobsPanel />); }); };
  const type = async (value: string) => {
    const input = container.querySelector("input[type=search]") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  };

  it("filters the register by a key fragment", async () => {
    await mount();
    expect(container.textContent).toContain("tools.result_gate.soft_cap_chars");
    await type("loop_guard");
    expect(container.textContent).toContain("orchestration.loop_guard.failure_threshold");
    expect(container.textContent).toContain("orchestration.loop_guard.window_size");
    expect(container.textContent).not.toContain("tools.result_gate.soft_cap_chars");
    expect(container.textContent).toContain("2 of 3 settings match");
  });

  it("matches the human label too, not only the key", async () => {
    await mount();
    await type("Largest tool result");
    expect(container.textContent).toContain("tools.result_gate.soft_cap_chars");
    expect(container.textContent).not.toContain("orchestration.loop_guard.window_size");
  });

  it("says so rather than showing an empty list when nothing matches", async () => {
    await mount();
    await type("nothing_registered_by_this_name");
    expect(container.textContent).toContain("No setting matches that search");
  });

  it("opens filtered to the row a ?knob= deep link names", async () => {
    searchParams = new URLSearchParams("knob=orchestration.loop_guard.failure_threshold");
    await mount();
    expect(container.textContent).toContain("orchestration.loop_guard.failure_threshold");
    expect(container.textContent).not.toContain("orchestration.loop_guard.window_size");
    expect((container.querySelector("input[type=search]") as HTMLInputElement).value).toBe("orchestration.loop_guard.failure_threshold");
  });

  it("drops the deep link when the search is cleared, so the box cannot refill itself", async () => {
    searchParams = new URLSearchParams("knob=orchestration.loop_guard.failure_threshold");
    await mount();
    await type("");
    expect(replace).toHaveBeenCalledWith("?", { scroll: false });
  });
});
