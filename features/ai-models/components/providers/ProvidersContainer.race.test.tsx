import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProvidersContainer from "./ProvidersContainer";
import { aiModelService } from "../../service";
import type { AiProvider } from "../../types";

type ProviderTableProbeProps = {
  providers: AiProvider[];
  error: string | null;
  onSelect: (provider: AiProvider) => void;
  onRetry: () => void;
  onDelete: (provider: AiProvider) => void;
  onCreate: () => void;
};

let tableProps: ProviderTableProbeProps | null = null;
let query = "";

jest.mock("./ProviderTable", () => ({
  __esModule: true,
  default: (props: ProviderTableProbeProps) => {
    tableProps = props;
    const first = props.providers[0];
    return (
      <div>
        <button type="button" onClick={props.onRetry}>
          Refresh
        </button>
        <button type="button" onClick={props.onCreate}>
          Add provider
        </button>
        {first ? (
          <>
            <button type="button" onClick={() => props.onSelect(first)}>
              Open provider
            </button>
            <button type="button" onClick={() => props.onDelete(first)}>
              Delete provider
            </button>
            <output>{first.name}</output>
          </>
        ) : null}
      </div>
    );
  },
}));

jest.mock("./ProviderForm", () => ({
  __esModule: true,
  EMPTY_PROVIDER_FORM: {
    name: "",
    slug: "",
    company_description: "",
    documentation_link: "",
    models_link: "",
    website_url: "",
    logo_url: "",
    visibility: "public",
    doc_sources: [],
  },
  default: ({
    data,
    onChange,
  }: {
    data: { name: string };
    onChange: (next: Record<string, unknown>) => void;
  }) => (
    <input
      aria-label="Provider name"
      value={data.name}
      onChange={(event) => onChange({ ...data, name: event.target.value })}
    />
  ),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/ai/ai-models/providers",
  useRouter: () => ({
    push: (url: string) => {
      query = url.split("?")[1] ?? "";
    },
  }),
  useSearchParams: () => new URLSearchParams(query),
}));

jest.mock("../../service", () => ({
  aiModelService: {
    fetchAllProviders: jest.fn(),
    updateProvider: jest.fn(),
    deleteProvider: jest.fn(),
  },
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

const provider = (name: string, version: number): AiProvider => ({
  id: "provider-1",
  name,
  version,
  slug: null,
  company_description: null,
  documentation_link: null,
  models_link: null,
  website_url: null,
  logo_url: null,
  visibility: "public",
  doc_sources: [],
  is_system: false,
  organization_id: "system",
  provider_models_cache: null,
  metadata: {},
  sync_policy: {},
  created_at: "2026-01-01",
  created_by: null,
  updated_at: "2026-01-01",
  updated_by: null,
  deleted_at: null,
});

describe("ProvidersContainer refresh races", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    jest.useFakeTimers();
    jest.mocked(aiModelService.fetchAllProviders).mockReset();
    jest.mocked(aiModelService.updateProvider).mockReset();
    jest.mocked(aiModelService.deleteProvider).mockReset();
    tableProps = null;
    query = "";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  async function mount(initial: AiProvider) {
    jest
      .mocked(aiModelService.fetchAllProviders)
      .mockResolvedValueOnce([initial]);
    await act(async () => {
      root.render(<ProvidersContainer />);
    });
    act(() => {
      jest.runAllTimers();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tableProps!.providers[0].name).toBe(initial.name);
  }

  it("does not let a refresh started before save overwrite the saved provider", async () => {
    const original = provider("Original", 1);
    const saved = provider("Saved", 2);
    const staleRefresh = deferred<AiProvider[]>();
    await mount(original);
    jest
      .mocked(aiModelService.fetchAllProviders)
      .mockReturnValueOnce(staleRefresh.promise);
    await act(async () => {
      host.querySelector("button")!.click();
    });
    await act(async () => {
      tableProps!.onSelect(original);
    });
    const input = host.querySelector("input")!;
    await act(async () => {
      changeInput(input, "Saved");
    });
    jest.mocked(aiModelService.updateProvider).mockResolvedValueOnce(saved);
    await act(async () => {
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Save")!
        .click();
    });
    await act(async () => {
      staleRefresh.resolve([original]);
    });
    expect(tableProps!.providers[0].name).toBe("Saved");
  });

  it("does not let a refresh started before delete restore the deleted provider", async () => {
    const original = provider("Original", 1);
    const staleRefresh = deferred<AiProvider[]>();
    await mount(original);
    jest
      .mocked(aiModelService.fetchAllProviders)
      .mockReturnValueOnce(staleRefresh.promise);
    await act(async () => {
      host.querySelector("button")!.click();
    });
    jest.mocked(aiModelService.deleteProvider).mockResolvedValueOnce(undefined);
    await act(async () => {
      tableProps!.onDelete(original);
    });
    await act(async () => {
      staleRefresh.resolve([original]);
    });
    expect(tableProps!.providers).toEqual([]);
  });

  it("preserves a dirty same-id draft when a newer refresh arrives", async () => {
    const original = provider("Original", 1);
    const refreshed = provider("Remote edit", 2);
    await mount(original);
    await act(async () => {
      tableProps!.onSelect(original);
    });
    const input = host.querySelector("input")!;
    await act(async () => {
      changeInput(input, "My draft");
    });
    jest
      .mocked(aiModelService.fetchAllProviders)
      .mockResolvedValue([refreshed]);
    await act(async () => {
      tableProps!.onRetry();
    });
    act(() => {
      jest.runAllTimers();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(tableProps!.providers[0].name).toBe("Remote edit");
    expect((host.querySelector("input") as HTMLInputElement).value).toBe(
      "My draft",
    );
    expect(host.textContent).toContain("changed elsewhere");
  });

  it("keeps a new provider draft after its first edit", async () => {
    await mount(provider("Original", 1));
    await act(async () => {
      tableProps!.onCreate();
    });
    const input = host.querySelector("input")!;
    await act(async () => {
      changeInput(input, "New draft");
    });
    expect((host.querySelector("input") as HTMLInputElement).value).toBe(
      "New draft",
    );
  });

  it("surfaces a failed initial load and clears it after a successful retry", async () => {
    jest
      .mocked(aiModelService.fetchAllProviders)
      .mockRejectedValueOnce(new Error("catalog unavailable"));
    await act(async () => {
      root.render(<ProvidersContainer />);
    });
    act(() => {
      jest.runAllTimers();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tableProps!.error).toBe("catalog unavailable");
    jest
      .mocked(aiModelService.fetchAllProviders)
      .mockResolvedValueOnce([provider("Recovered", 1)]);
    await act(async () => {
      tableProps!.onRetry();
    });
    expect(tableProps!.error).toBeNull();
    expect(tableProps!.providers[0].name).toBe("Recovered");
  });
});
