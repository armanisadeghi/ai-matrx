import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "util";

jest.mock("lossless-json", () => ({
  LosslessNumber: class LosslessNumber {},
  parse: JSON.parse,
  stringify: JSON.stringify,
}));

import { VaultCsvImportDialog } from "./VaultCsvImportDialog";
import { VaultWorkspace } from "./VaultWorkspace";
import { fetchBitwardenJsonImportLimits, fetchCsvImportLimits } from "../csv-import-limits";
import { createVaultItem, VaultImportTransportError } from "../vault-service";

let mockAuthStateListener:
  | ((event: string, session?: { user: { id: string } } | null) => void)
  | undefined;
let mockOrganizationId = "11111111-1111-4111-8111-111111111111";

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (
        listener: (event: string, session?: { user: { id: string } } | null) => void,
      ) => {
        mockAuthStateListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));

jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [] }),
}));

jest.mock("../vault-hooks", () => ({
  useVault: () => ({
    items: [],
    loading: false,
    busy: false,
    error: null,
    refresh: async () => undefined,
    actions: {},
  }),
  useVaultDefinitions: () => ({ definitions: [] }),
}));

jest.mock("./VaultContextMenu", () => ({
  VaultContextMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => mockOrganizationId,
}));

jest.mock("../csv-import-limits", () => ({
  fetchCsvImportLimits: jest.fn(async () => ({
    maxFileBytes: 10_000,
    maxRecords: 20,
    maxColumns: 20,
    maxCellBytes: 1_000,
    maxFields: 202,
    maxPlaintextFieldBytes: 1_000,
    maxRequestBodyBytes: 10_000,
  })),
  fetchBitwardenJsonImportLimits: jest.fn(async () => ({
    maxFileBytes: 10_000, maxRecords: 20, maxColumns: 20, maxCellBytes: 1_000,
    maxFields: 202, maxPlaintextFieldBytes: 1_000, maxRequestBodyBytes: 10_000,
    maxJsonDepth: 64, jsonWorkerTimeoutMs: 50,
  })),
}));

type ControlledWorker = { terminated: boolean; onmessage: ((event: MessageEvent<{ ok: boolean; records?: unknown[]; error?: string }>) => void) | null; onerror: (() => void) | null; onmessageerror: (() => void) | null; postMessage: jest.Mock; terminate: jest.Mock };
let workers: ControlledWorker[] = [];
jest.mock("../bitwarden-json-worker-client", () => ({
  createBitwardenJsonWorker: () => {
    const worker: ControlledWorker = { terminated: false, onmessage: null, onerror: null, onmessageerror: null, postMessage: jest.fn(), terminate: jest.fn(() => { worker.terminated = true; }) };
    workers.push(worker);
    return worker;
  },
}));

jest.mock("../vault-service", () => ({
  getVaultImportActor: jest.fn(async () => ({
    userId: "user-1",
    organizationId: "11111111-1111-4111-8111-111111111111",
  })),
  createVaultItem: jest.fn(),
  VaultImportTransportError: class VaultImportTransportError extends Error {
    code: "context_changed" | "request_rejected" | "retryable";
    constructor(code: "context_changed" | "request_rejected" | "retryable") {
      super(code);
      this.code = code;
    }
  },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.TextDecoder === "undefined") {
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: TextDecoder,
  });
}
if (typeof globalThis.TextEncoder === "undefined") Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: TextEncoder });
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}

const createVaultItemMock = jest.mocked(createVaultItem);
const fetchCsvImportLimitsMock = jest.mocked(fetchCsvImportLimits);
const fetchBitwardenJsonImportLimitsMock = jest.mocked(fetchBitwardenJsonImportLimits);

function csvFile(text: string): File {
  const file = new File([text], "passwords.csv", { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () =>
      Uint8Array.from([...text].map((character) => character.charCodeAt(0)))
        .buffer,
  });
  return file;
}

function jsonFile(text: string, size = text.length): File {
  const file = new File([text], "vault.json", { type: "application/json" });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  Object.defineProperty(file, "arrayBuffer", { value: jest.fn(async () => new TextEncoder().encode(text).buffer) });
  return file;
}

function jsonRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ordinal: 0,
    title: "Example",
    kind: "website_login",
    status: "supported",
    sourceRecord: '{"source_vendor":"bitwarden"}',
    urls: ["https://example.test"],
    hasOtp: false,
    username: "user",
    password: "password",
    deleted: false,
    hasVisiblePublicKey: false,
    ...overrides,
  };
}

async function chooseBitwardenJson(): Promise<HTMLInputElement> {
  const trigger = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("CSV export") ||
    button.textContent?.includes("Bitwarden JSON"),
  );
  if (!(trigger instanceof HTMLButtonElement)) throw new Error("source trigger missing");
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent?.includes("Bitwarden JSON"));
  if (!(option instanceof HTMLElement)) throw new Error("JSON source option missing");
  await act(async () => option.click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const input = document.body.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("file input missing");
  if (!input.accept.includes("application/json")) throw new Error(`JSON source was not selected: ${input.accept}`);
  return input;
}

describe("VaultCsvImportDialog", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    createVaultItemMock.mockReset();
    mockAuthStateListener = undefined;
    mockOrganizationId = "11111111-1111-4111-8111-111111111111";
    workers = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("renders every masked CSV row, including rows after the former five-row cutoff", async () => {
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    const input = document.body.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement))
      throw new Error("file input missing");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        csvFile(
          "title\nCredential 1\nCredential 2\nCredential 3\nCredential 4\nCredential 5\nCredential 6",
        ),
      ],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.textContent).toContain("Row 7: Credential 6");
  });

  it("clears a loaded preview when the signed-in account changes", async () => {
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    const input = document.body.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement))
      throw new Error("file input missing");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [csvFile("title\nCredential")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.textContent).toContain("Masked preview:");
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () => mockAuthStateListener?.("SIGNED_OUT"));
    expect(document.body.textContent).not.toContain("Masked preview:");
    expect(document.body.textContent).toContain("account changed");
  });

  it("opens cleanly after request-organization hydration while the dialog is closed and idle", async () => {
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open={false}
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    mockOrganizationId = "22222222-2222-4222-8222-222222222222";
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open={false}
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    expect(document.body.textContent).toContain("Choose import file");
    expect(document.body.textContent).not.toContain("request organization changed");
  });

  it("refuses a normalized over-limit row before the create transport", async () => {
    fetchCsvImportLimitsMock.mockResolvedValueOnce({
      maxFileBytes: 10_000,
      maxRecords: 20,
      maxColumns: 20,
      maxCellBytes: 1_000,
      maxFields: 202,
      maxPlaintextFieldBytes: 4,
      maxRequestBodyBytes: 10_000,
    });
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    const input = document.body.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement))
      throw new Error("file input missing");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [csvFile("title,password\nExample,secret")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.textContent).toContain(
      "Row 2 exceeds this organization’s encrypted field limit.",
    );
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Import selected records"),
    );
    if (!(button instanceof HTMLButtonElement))
      throw new Error("import button missing");
    await act(async () => button.click());
    expect(createVaultItemMock).not.toHaveBeenCalled();
  });

  it("clears a definitive rejection instead of retrying its frozen command", async () => {
    createVaultItemMock
      .mockResolvedValueOnce({ id: "first", display_name: "First" } as never)
      .mockRejectedValueOnce(new Error("validation rejected"));
    await act(async () => {
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      );
    });
    const input = document.body.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement))
      throw new Error("file input missing");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [csvFile("title,password\nFirst,one\nSecond,two")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Import selected records"),
    );
    if (!(button instanceof HTMLButtonElement))
      throw new Error("import button missing");
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(createVaultItemMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain(
      "Imported 1; skipped 0; failed 1.",
    );
    expect(document.body.textContent).not.toContain("Retry current row");
    expect(document.body.textContent).not.toContain("Import selected records");
  });

  it("opens the real CSV dialog from the full workspace", async () => {
    await act(async () => {
      root.render(
        <VaultWorkspace principal={{ type: "user" }} presentation="full" />,
      );
    });
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Import passwords"),
    );
    if (!(button instanceof HTMLButtonElement))
      throw new Error("full import trigger missing");
    await act(async () => button.click());
    expect(document.body.textContent).toContain("Import passwords");
    expect(document.body.textContent).toContain("Choose import file");
  });

  it("terminates a mounted JSON worker and rejects its late reply after account change", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    const file = jsonFile("{}");
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(fetchBitwardenJsonImportLimitsMock).toHaveBeenCalled();
    expect(file.arrayBuffer).toHaveBeenCalled();
    expect(workers).toHaveLength(1);
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () => mockAuthStateListener?.("SIGNED_OUT"));
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () => workers[0]?.onmessage?.({ data: { ok: true, records: [{ ordinal: 0, title: "late" }] } } as MessageEvent));
    expect(document.body.textContent).not.toContain("late");
  });

  it("terminates a mounted JSON worker before a SIGNED_IN actor replacement can return its draft", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}")] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () => mockAuthStateListener?.("SIGNED_IN", { user: { id: "user-b" } }));
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () => workers[0]?.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "late signed in" })] } } as MessageEvent));
    expect(document.body.textContent).not.toContain("late signed in");
    expect(document.body.textContent).toContain("account changed");
  });

  it("keeps a loaded draft through a same-actor token refresh", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () => mockAuthStateListener?.("INITIAL_SESSION", { user: { id: "user-1" } }));
    const input = document.body.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("file input missing");
    Object.defineProperty(input, "files", { configurable: true, value: [csvFile("title\nCredential")] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.body.textContent).toContain("Masked preview:");
    await act(async () => mockAuthStateListener?.("TOKEN_REFRESHED", { user: { id: "user-1" } }));
    expect(document.body.textContent).toContain("Masked preview:");
  });

  it("refuses an oversized JSON file before reading it", async () => {
    fetchBitwardenJsonImportLimitsMock.mockResolvedValueOnce({ maxFileBytes: 1, maxRecords: 20, maxColumns: 20, maxCellBytes: 1_000, maxFields: 202, maxPlaintextFieldBytes: 1_000, maxRequestBodyBytes: 10_000, maxJsonDepth: 64, jsonWorkerTimeoutMs: 50 });
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    const file = jsonFile("{}", 2);
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("exceeds");
    expect(document.body.textContent).not.toContain("administrator");
  });

  it("replaces a JSON worker and ignores a late reply from the replaced worker", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () => workers[0]?.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "stale" })] } } as MessageEvent));
    await act(async () => workers[1]?.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "fresh" })] } } as MessageEvent));
    expect(document.body.textContent).not.toContain("stale");
    expect(document.body.textContent).toContain("fresh");
  });

  it("invalidates a mounted JSON worker on principal and request-organization changes", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "organization", organizationId: "organization-2" }} existingItems={[]} onCommitted={async () => undefined} />));
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () => workers[0]?.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "principal stale" })] } } as MessageEvent));
    expect(document.body.textContent).toContain("destination changed");
    expect(document.body.textContent).not.toContain("principal stale");

    const freshInput = await chooseBitwardenJson();
    Object.defineProperty(freshInput, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { freshInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    mockOrganizationId = "22222222-2222-4222-8222-222222222222";
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "organization", organizationId: "organization-2" }} existingItems={[]} onCommitted={async () => undefined} />));
    expect(workers[1]?.terminate).toHaveBeenCalled();
    await act(async () => workers[1]?.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "organization stale" })] } } as MessageEvent));
    expect(document.body.textContent).toContain("request organization changed");
    expect(document.body.textContent).not.toContain("organization stale");
    expect(document.body.textContent).not.toContain("Import selected records");
  });

  it("does not resurrect a timed-out or errored JSON parse after worker cleanup", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    const first = workers[0];
    if (!first) throw new Error("worker missing");
    await act(async () => first.onmessage?.({ data: { ok: false, error: "untrusted export detail" } } as MessageEvent));
    expect(first.terminate).toHaveBeenCalled();
    expect(document.body.textContent).toContain("could not be read");
    expect(document.body.textContent).not.toContain("untrusted export detail");
    await act(async () => first.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "error stale" })] } } as MessageEvent));
    expect(document.body.textContent).not.toContain("error stale");

    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    const second = workers[1];
    if (!second) throw new Error("replacement worker missing");
    // This is the deadline behavior under test, so wait for the configured worker deadline.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(second.terminate).toHaveBeenCalled();
    expect(document.body.textContent).toContain("took too long");
    await act(async () => second.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "timeout stale" })] } } as MessageEvent));
    expect(document.body.textContent).not.toContain("timeout stale");
  });

  it("shows JSON duplicate, invalid, unsupported, and deleted accounting before and after import", async () => {
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[{ displayName: "Example", loginUrls: ["https://example.test"] }]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    await act(async () => workers[0]?.onmessage?.({ data: { ok: true, records: [
      jsonRecord(),
      jsonRecord({ ordinal: 1, title: "Invalid", status: "invalid", reason: "Bad shape", sourceRecord: undefined }),
      jsonRecord({ ordinal: 2, title: "Unsupported", status: "unsupported", reason: "Passkey", sourceRecord: undefined }),
      jsonRecord({ ordinal: 3, title: "Deleted", status: "skipped", deleted: true }),
    ] } } as MessageEvent));
    expect(document.body.textContent).toContain("0 selected; 1 skipped; 1 invalid; 1 unsupported; 1 deleted.");
    expect(document.body.textContent).toContain("destination https://example.test");
    const duplicateToggle = document.body.querySelector('[role="switch"]');
    if (!(duplicateToggle instanceof HTMLElement)) throw new Error("duplicate toggle missing");
    await act(async () => duplicateToggle.click());
    expect(document.body.textContent).toContain("1 selected; 0 skipped; 1 invalid; 1 unsupported; 1 deleted.");
    const invalidSkip = [...document.querySelectorAll("button")].find((button) => button.textContent === "Skip");
    if (!(invalidSkip instanceof HTMLButtonElement)) throw new Error("invalid skip missing");
    await act(async () => invalidSkip.click());
    const approval = [...document.querySelectorAll('[role="switch"]')].find((node) => node.parentElement?.textContent?.includes("I approve disclosure"));
    if (!(approval instanceof HTMLElement)) throw new Error("approval toggle missing");
    await act(async () => approval.click());
    const importButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Import selected records"));
    if (!(importButton instanceof HTMLButtonElement)) throw new Error("import button missing");
    createVaultItemMock.mockResolvedValueOnce({ id: "created", display_name: "Example" } as never);
    await act(async () => { importButton.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(createVaultItemMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Imported 1; skipped 0; failed 0. Invalid 1; unsupported 1; deleted 1.");
  });

  it("retries only the unresolved JSON command with its original UUID and cursor", async () => {
    createVaultItemMock
      .mockResolvedValueOnce({ id: "first", display_name: "First" } as never)
      .mockRejectedValueOnce(new VaultImportTransportError("retryable"))
      .mockResolvedValueOnce({ id: "second", display_name: "Second" } as never);
    await act(async () => root.render(<VaultCsvImportDialog open onOpenChange={jest.fn()} principal={{ type: "user" }} existingItems={[]} onCommitted={async () => undefined} />));
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", { configurable: true, value: [jsonFile("{}") ] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
    await act(async () => workers[0]?.onmessage?.({ data: { ok: true, records: [jsonRecord({ title: "First" }), jsonRecord({ ordinal: 1, title: "Second", urls: ["https://second.test"] })] } } as MessageEvent));
    const approval = [...document.querySelectorAll('[role="switch"]')].find((node) => node.parentElement?.textContent?.includes("I approve disclosure"));
    if (!(approval instanceof HTMLElement)) throw new Error("approval toggle missing");
    await act(async () => approval.click());
    const importButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Import selected records"));
    if (!(importButton instanceof HTMLButtonElement)) throw new Error("import button missing");
    await act(async () => { importButton.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(createVaultItemMock).toHaveBeenCalledTimes(2);
    const retryButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Retry current row"));
    if (!(retryButton instanceof HTMLButtonElement)) throw new Error("retry button missing");
    await act(async () => { retryButton.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(createVaultItemMock).toHaveBeenCalledTimes(3);
    const calls = createVaultItemMock.mock.calls;
    expect(calls.map(([body]) => body.display_name)).toEqual(["First", "Second", "Second"]);
    expect(calls[2]?.[0]).toEqual(calls[1]?.[0]);
    expect(calls[2]?.[1]?.idempotencyKey).toBe(calls[1]?.[1]?.idempotencyKey);
    expect(calls[0]?.[1]?.idempotencyKey).not.toBe(calls[1]?.[1]?.idempotencyKey);
    expect(document.body.textContent).toContain("Imported 2; skipped 0; failed 0.");
  });

});
