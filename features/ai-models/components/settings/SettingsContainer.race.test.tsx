import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SettingsContainer from "./SettingsContainer";
import { aiModelService } from "../../service";
import type { AiSetting } from "../../types";

type SettingTableProbeProps = {
  settings: AiSetting[];
  onSelect: (row: AiSetting) => void;
  onRetry: () => void;
};

let tableProps: SettingTableProbeProps | null = null;

jest.mock("./SettingTable", () => ({
  __esModule: true,
  default: (props: SettingTableProbeProps) => {
    tableProps = props;
    const first = props.settings[0];
    return (
      <div>
        <button type="button" onClick={props.onRetry}>
          Refresh
        </button>
        {first ? (
          <>
            <button type="button" onClick={() => props.onSelect(first)}>
              Open setting
            </button>
            <output>{first.key}</output>
          </>
        ) : null}
      </div>
    );
  },
}));

jest.mock("./SettingForm", () => ({
  __esModule: true,
  default: ({
    data,
    onChange,
  }: {
    data: { key: string };
    onChange: (next: Record<string, unknown>) => void;
  }) => (
    <input
      aria-label="Setting key"
      value={data.key}
      onChange={(event) => onChange({ ...data, key: event.target.value })}
    />
  ),
}));

jest.mock("../../service", () => ({
  aiModelService: { fetchSettings: jest.fn(), updateSetting: jest.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function changeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const setting = (key: string, version: number): AiSetting => ({
  id: "setting-1",
  key,
  version,
  value_type: "number",
  canonical_min: null,
  canonical_max: null,
  canonical_values: [],
  default_value: null,
  ui: {},
  description: null,
  visibility: "public",
  is_system: false,
  organization_id: "system",
  metadata: {},
  created_at: "2026-01-01",
  created_by: null,
  updated_at: "2026-01-01",
  updated_by: null,
  deleted_at: null,
});

describe("SettingsContainer refresh races", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    jest.mocked(aiModelService.fetchSettings).mockReset();
    jest.mocked(aiModelService.updateSetting).mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  async function mount(row: AiSetting) {
    jest.mocked(aiModelService.fetchSettings).mockResolvedValueOnce([row]);
    await act(async () => {
      root.render(<SettingsContainer />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tableProps!.settings[0].key).toBe(row.key);
  }

  it("does not let a refresh started before save overwrite the saved setting", async () => {
    const original = setting("original", 1);
    const saved = setting("saved", 2);
    const stale = deferred<AiSetting[]>();
    await mount(original);
    jest
      .mocked(aiModelService.fetchSettings)
      .mockReturnValueOnce(stale.promise);
    await act(async () => {
      tableProps!.onRetry();
    });
    await act(async () => {
      tableProps!.onSelect(original);
    });
    await act(async () => {
      changeInput(host.querySelector("input")!, "saved");
    });
    jest.mocked(aiModelService.updateSetting).mockResolvedValueOnce(saved);
    await act(async () => {
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Save")!
        .click();
    });
    await act(async () => {
      stale.resolve([original]);
    });
    expect(tableProps!.settings[0].key).toBe("saved");
  });
});
