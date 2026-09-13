/**
 * Regression coverage for the provider/settings list refresh boundary.
 * Before the retained-row failure UI, a refresh error either displaced useful
 * rows or had no visible recovery action; these tests exercise the real table.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProviderTable, {
  type ProviderTableProps,
} from "./providers/ProviderTable";
import SettingTable, {
  type SettingTableProps,
} from "./settings/SettingTable";
import type { AiProvider, AiSetting } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const provider = {
  id: "provider-anthropic",
  name: "Anthropic",
  slug: "anthropic",
  company_description: "AI safety and research company",
  created_at: "2026-09-12T00:00:00.000Z",
  created_by: null,
  deleted_at: null,
  doc_sources: [],
  documentation_link: "https://docs.anthropic.com",
  is_system: true,
  logo_url: null,
  metadata: {},
  models_link: "https://docs.anthropic.com/models",
  organization_id: "00000000-0000-4000-8000-000000000001",
  provider_models_cache: null,
  sync_policy: {},
  updated_at: "2026-09-12T00:00:00.000Z",
  updated_by: null,
  version: 1,
  visibility: "personal",
  website_url: "https://anthropic.com",
} satisfies AiProvider;

const setting = {
  id: "setting-temperature",
  key: "temperature",
  value_type: "number",
  canonical_min: 0,
  canonical_max: 2,
  canonical_values: null,
  created_at: "2026-09-12T00:00:00.000Z",
  created_by: null,
  default_value: 1,
  deleted_at: null,
  description: "Controls response variation",
  is_system: true,
  metadata: {},
  organization_id: "00000000-0000-4000-8000-000000000001",
  ui: {},
  updated_at: "2026-09-12T00:00:00.000Z",
  updated_by: null,
  version: 1,
  visibility: "personal",
} satisfies AiSetting;

type TableCase = {
  name: string;
  rowLabel: string;
  loadError: string;
  render: (props: TableProps) => React.JSX.Element;
};

type TableProps = {
  rows: boolean;
  isLoading: boolean;
  error: string | null;
  onRetry: jest.Mock;
};

const cases: readonly TableCase[] = [
  {
    name: "providers",
    rowLabel: provider.name,
    loadError: "Providers could not be loaded",
    render: ({ rows, isLoading, error, onRetry }) => (
      <ProviderTable
        providers={rows ? [provider] : []}
        isLoading={isLoading}
        error={error}
        selectedId={null}
        onSelect={jest.fn<ReturnType<ProviderTableProps["onSelect"]>, Parameters<ProviderTableProps["onSelect"]>>()}
        onEdit={jest.fn<ReturnType<ProviderTableProps["onEdit"]>, Parameters<ProviderTableProps["onEdit"]>>()}
        onDelete={jest.fn<ReturnType<ProviderTableProps["onDelete"]>, Parameters<ProviderTableProps["onDelete"]>>()}
        onCreate={jest.fn()}
        onRetry={onRetry}
      />
    ),
  },
  {
    name: "settings",
    rowLabel: setting.key,
    loadError: "Settings could not be loaded",
    render: ({ rows, isLoading, error, onRetry }) => (
      <SettingTable
        settings={rows ? [setting] : []}
        isLoading={isLoading}
        error={error}
        selectedId={null}
        onSelect={jest.fn<ReturnType<SettingTableProps["onSelect"]>, Parameters<SettingTableProps["onSelect"]>>()}
        onEdit={jest.fn<ReturnType<SettingTableProps["onEdit"]>, Parameters<SettingTableProps["onEdit"]>>()}
        onDelete={jest.fn<ReturnType<SettingTableProps["onDelete"]>, Parameters<SettingTableProps["onDelete"]>>()}
        onCreate={jest.fn()}
        onRetry={onRetry}
      />
    ),
  },
];

describe.each(cases)("$name refresh failures", ({ rowLabel, loadError, render }) => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows an initial load failure with a visible Retry action", async () => {
    const onRetry = jest.fn();
    await act(async () => {
      root.render(render({ rows: false, isLoading: false, error: loadError, onRetry }));
    });

    expect(host.textContent).toContain(loadError);
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Retry",
    );
    if (!retry) throw new Error("Initial load failure did not render Retry.");
    await act(async () => {
      retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps prior rows visible while a failed refresh is loading", async () => {
    const onRetry = jest.fn();
    await act(async () => {
      root.render(render({ rows: true, isLoading: true, error: loadError, onRetry }));
    });

    expect(host.textContent).toContain(rowLabel);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(loadError);
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Retry refresh",
    );
    if (!retry) throw new Error("Retained-row refresh failure did not render Retry refresh.");
    await act(async () => {
      retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("clears the failure after a healthy rerender without removing table controls", async () => {
    const onRetry = jest.fn();
    await act(async () => {
      root.render(render({ rows: true, isLoading: false, error: loadError, onRetry }));
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(loadError);

    await act(async () => {
      root.render(render({ rows: true, isLoading: false, error: null, onRetry }));
    });

    expect(host.textContent).toContain(rowLabel);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]')).not.toBeNull();
  });
});
