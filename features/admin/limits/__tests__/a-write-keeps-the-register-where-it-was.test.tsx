/** @jest-environment jsdom */
//
// 🚨 A WRITE NEVER THROWS THE OPERATOR BACK TO THE TOP OF THE REGISTER.
//
// The break this catches: every refresh of the system register (the row's own
// onChanged, and the `settings_changed` directive the server sends after ANY
// override write) bumped the provider's generation, and the system read was
// masked by `requestKey|generation` — so for the whole re-read the register had
// ZERO knobs, the panel fell back to "Loading knobs…", every row and the opened
// "All levels" panel unmounted, and the browser snapped to the top of ~1,900
// rows. A refresh of the SAME destination must keep the rows it has until the
// new read lands; only a different destination masks synchronously.
//
// SUT: the real `UniversalSettingsProvider` (system target) + the real
// `FeatureKnobsPanel`. Stubbed: the registry read (a controlled deferred), the
// taxonomy read, the count read, the directive bus, redux identity, and the
// row renderer (a thin stand-in that prints each row's meta action and the
// thing hung under it — what it renders is not under test, WHETHER it stays
// mounted is).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FeatureKnob } from "@/features/admin/limits/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const handlers: Array<(payload: { feature: string; key: string }) => void> = [];
const fetchFeatureKnobs = jest.fn<Promise<FeatureKnob[]>, []>();
let rowOnChanged: (() => void) | null = null;

jest.mock("@/features/admin/limits/service", () => ({ fetchFeatureKnobs: () => fetchFeatureKnobs() }));
jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobOverrideCounts: jest.fn(async () => []) }));
jest.mock("@/features/settings/universal/taxonomy", () => ({
  ...jest.requireActual("@/features/settings/universal/taxonomy"),
  fetchTaxonomyIndex: jest.fn(async () => ({ byId: new Map(), bySlug: new Map() })),
}));
jest.mock("@/lib/scoped-config/deviceId", () => ({ getWebDeviceId: () => null }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ invalidateEffectiveKnob: jest.fn() }));
jest.mock("@/lib/knobs/featureKnobs", () => ({ invalidateFeatureKnobs: jest.fn() }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({
  registerDirectiveHandler: (_: string, handler: (payload: { feature: string; key: string }) => void) => {
    handlers.push(handler);
    return () => {
      const at = handlers.indexOf(handler);
      if (at >= 0) handlers.splice(at, 1);
    };
  },
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [], loading: false, error: null, refresh: () => {} }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (selector: unknown) => (selector as () => unknown)() }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => null }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd",
  selectIsSuperAdmin: () => true,
  selectAdminFeature: () => true,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }), useSearchParams: () => new URLSearchParams() }));
jest.mock("@/components/official/settings/SettingsDesignProvider", () => ({
  SettingsDesignProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/settings/universal/UniversalSettingsPane", () => ({
  UniversalSettingsRows: ({
    knobs,
    rowMetaAction,
    rowBelow,
    onChanged,
  }: {
    knobs: Array<{ full_key: string; label: string }>;
    rowMetaAction: (knob: unknown) => React.ReactNode;
    rowBelow: (knob: unknown) => React.ReactNode;
    onChanged: () => void;
  }) => {
    rowOnChanged = onChanged;
    return (
      <ul>
        {knobs.map((knob) => (
          <li key={knob.full_key} data-row={knob.full_key}>
            <span>{knob.label}</span> {rowMetaAction(knob)}
            {rowBelow(knob)}
          </li>
        ))}
      </ul>
    );
  },
}));
// The opened panel's own reads are not under test; whether it survives is.
jest.mock("@/features/admin/limits/components/KnobOverridesAdmin", () => ({
  KnobOverridesAdmin: ({ knob }: { knob: { full_key: string } }) => <div data-open-panel={knob.full_key}>every level of {knob.full_key}</div>,
}));

import { FeatureKnobsPanel } from "@/features/admin/limits/components/FeatureKnobsPanel";

function registryRow(key: string, label: string, value: unknown): FeatureKnob {
  return {
    feature: "data_tables",
    key,
    value,
    default_value: false,
    value_type: "boolean",
    unit: null,
    min_value: null,
    max_value: null,
    allowed_values: null,
    label,
    description: "",
    set_by: "human",
    basis: null,
    review_due: null,
    overridable_by: ["organization", "user"],
    override_direction: "any",
    bound_value: null,
    ui: {},
    taxonomy_node_id: null,
    propagation: "instant",
  };
}

const FIRST_READ = [
  registryRow("merged_grid", "Tables use the new spreadsheet grid", false),
  registryRow("row_comments", "Rows carry a comment thread", true),
];
const AFTER_WRITE = [
  registryRow("merged_grid", "Tables use the new spreadsheet grid (renamed by the write)", true),
  registryRow("row_comments", "Rows carry a comment thread", true),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("a refresh after a write keeps the register where the operator left it", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    handlers.length = 0;
    rowOnChanged = null;
    fetchFeatureKnobs.mockReset().mockResolvedValueOnce(FIRST_READ);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<FeatureKnobsPanel />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Open "All levels" on the key being worked on.
    const opener = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "All levels" && button.closest("[data-row]")?.getAttribute("data-row") === "data_tables.merged_grid",
    );
    expect(opener).toBeDefined();
    await act(async () => {
      opener!.click();
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    ["the server's settings_changed directive", () => handlers.forEach((handler) => handler({ feature: "data_tables", key: "merged_grid" }))],
    ["the row's own onChanged", () => rowOnChanged?.()],
  ])("keeps every row and the open panel mounted while %s re-reads, then shows the new read in place", async (_, trigger) => {
    const row = container.querySelector('[data-row="data_tables.merged_grid"]');
    const panel = container.querySelector('[data-open-panel="data_tables.merged_grid"]');
    expect(row).not.toBeNull();
    expect(panel).not.toBeNull();

    const reread = deferred<FeatureKnob[]>();
    fetchFeatureKnobs.mockReturnValueOnce(reread.promise);
    await act(async () => {
      trigger();
    });

    // Mid re-read: nothing blanked, nothing remounted.
    expect(fetchFeatureKnobs).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("Loading knobs");
    expect(container.querySelector('[data-row="data_tables.merged_grid"]')).toBe(row);
    expect(container.querySelector('[data-open-panel="data_tables.merged_grid"]')).toBe(panel);

    await act(async () => {
      reread.resolve(AFTER_WRITE);
      await reread.promise;
    });

    // The new read lands in the SAME nodes (a refresh that never re-read would fail here).
    expect(container.textContent).toContain("renamed by the write");
    expect(container.querySelector('[data-row="data_tables.merged_grid"]')).toBe(row);
    expect(container.querySelector('[data-open-panel="data_tables.merged_grid"]')).toBe(panel);
  });
});
