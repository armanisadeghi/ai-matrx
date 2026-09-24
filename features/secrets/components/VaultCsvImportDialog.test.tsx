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
import {
  fetchBitwardenJsonImportLimits,
  fetchCsvImportLimits,
} from "../csv-import-limits";
import type { StructuredImportSource } from "../structured-import-source-registry";
import { createVaultItem, VaultImportTransportError } from "../vault-service";
import { readDashlaneCsvArchive } from "../dashlane-csv-archive";

let mockDeferredKeePassLoadWorker:
  | StructuredImportSource["loadWorker"]
  | undefined;

let mockAuthStateListener:
  | ((event: string, session?: { user: { id: string } } | null) => void)
  | undefined;
let mockOrganizationId = "11111111-1111-4111-8111-111111111111";

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: {}, schema: jest.fn(() => ({})) },
  createClient: () => ({
    auth: {
      onAuthStateChange: (
        listener: (
          event: string,
          session?: { user: { id: string } } | null,
        ) => void,
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
    maxFileBytes: 10_000,
    maxRecords: 20,
    maxColumns: 20,
    maxCellBytes: 1_000,
    maxFields: 202,
    maxPlaintextFieldBytes: 1_000,
    maxRequestBodyBytes: 10_000,
    maxJsonDepth: 64,
    // 🚨 GENEROUS ON PURPOSE. This is the worker's real wall-clock deadline: the
    // dialog arms `setTimeout(settle(timeoutError), jsonWorkerTimeoutMs)` the
    // moment it posts the parse, and when it fires it TERMINATES the worker and
    // clears `cancelJsonParse`. With the 50ms this mock used to return, every
    // test that posted a parse and then drove the UI had 50 real milliseconds to
    // finish before the thing it was about to assert on destroyed itself — and
    // under the full battery's 40 workers it did not: "cancels a 1PUX worker when
    // the source changes" and its KeePass twin failed in the 2026-09-19 whole-suite
    // run and passed alone. A deadline is a real behaviour and gets its own test
    // (below, "does not resurrect a timed-out or errored JSON parse"), which sets
    // its own 50ms. It must not be an ambient race under every other assertion.
    jsonWorkerTimeoutMs: 30_000,
  })),
}));

jest.mock("../dashlane-csv-archive", () => ({
  readDashlaneCsvArchive: jest.fn(),
}));

type ControlledWorker = {
  terminated: boolean;
  onmessage:
    | ((
        event: MessageEvent<{
          ok: boolean;
          records?: unknown[];
          error?: string;
        }>,
      ) => void)
    | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage: jest.Mock;
  terminate: jest.Mock;
};
let workers: ControlledWorker[] = [];
let onePuxWorkers: ControlledWorker[] = [];
let keePassWorkers: ControlledWorker[] = [];
jest.mock("../bitwarden-json-worker-client", () => ({
  createBitwardenJsonWorker: () => {
    const worker: ControlledWorker = {
      terminated: false,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: jest.fn(),
      terminate: jest.fn(() => {
        worker.terminated = true;
      }),
    };
    workers.push(worker);
    return worker;
  },
  cancelBitwardenJsonWorker: (worker: ControlledWorker, requestId: string) =>
    worker.postMessage({ type: "cancel", requestId }),
}));
jest.mock("../onepux-worker-client", () => ({
  createOnePuxWorker: () => {
    const worker: ControlledWorker = {
      terminated: false,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: jest.fn(),
      terminate: jest.fn(() => {
        worker.terminated = true;
      }),
    };
    onePuxWorkers.push(worker);
    return worker;
  },
  cancelOnePuxWorker: (worker: ControlledWorker, requestId?: string) =>
    worker.postMessage({ type: "cancel", requestId }),
}));
jest.mock("../structured-import-source-registry", () => {
  const actual = jest.requireActual(
    "../structured-import-source-registry",
  ) as typeof import("../structured-import-source-registry");
  return {
    ...actual,
    structuredImportSource: (source: string) => {
      const descriptor = actual.structuredImportSource(source);
      return source === "keepass_xml" && mockDeferredKeePassLoadWorker && descriptor
        ? { ...descriptor, loadWorker: mockDeferredKeePassLoadWorker }
        : descriptor;
    },
  };
});
jest.mock("../keepass-xml-worker-client", () => ({
  createKeePassXmlWorker: () => {
    const worker: ControlledWorker = {
      terminated: false,
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: jest.fn(),
      terminate: jest.fn(() => {
        worker.terminated = true;
      }),
    };
    keePassWorkers.push(worker);
    return worker;
  },
  cancelKeePassXmlWorker: (worker: ControlledWorker, requestId: string) =>
    worker.postMessage({ type: "cancel", requestId }),
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
if (typeof globalThis.TextEncoder === "undefined")
  Object.defineProperty(globalThis, "TextEncoder", {
    configurable: true,
    value: TextEncoder,
  });
if (!File.prototype.arrayBuffer) {
  Object.defineProperty(File.prototype, "arrayBuffer", {
    configurable: true,
    value: async function (this: File) {
      return new TextEncoder().encode(
        this.name === "credentials.csv"
          ? "title,username,password,url\nExample,user,secret,https://example.test"
          : "",
      ).buffer;
    },
  });
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}

const createVaultItemMock = jest.mocked(createVaultItem);
const fetchCsvImportLimitsMock = jest.mocked(fetchCsvImportLimits);
const fetchBitwardenJsonImportLimitsMock = jest.mocked(
  fetchBitwardenJsonImportLimits,
);
const readDashlaneCsvArchiveMock = jest.mocked(readDashlaneCsvArchive);

/**
 * Drain the dialog's pending promise chain after a file-input change.
 *
 * 🚨 NEVER A WALL-CLOCK SLEEP. Every one of these sites used to be
 * `await new Promise((r) => setTimeout(r, 10))`, which is not a wait for the
 * work — it is a bet that 10 real milliseconds is longer than a limits fetch
 * plus a worker spawn. On an idle machine it is; under the whole battery's 40
 * workers it is not, and "cancels a 1PUX worker when the source changes" failed
 * in the full run on 2026-09-19 while passing on its own. Yielding a fixed
 * number of macrotask turns drains the same chain and does not care how loaded
 * the machine is.
 *
 * The turn count is deliberately SMALL. Each turn is a macrotask, and the work
 * being drained is two awaits (the limits fetch, then `loadWorker()`); a large
 * count would spend real milliseconds for nothing and walk into the worker's own
 * deadline — which is the very race this replaced.
 */
async function settle(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function waitForCondition(
  condition: () => boolean,
  message: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

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
  Object.defineProperty(file, "arrayBuffer", {
    value: jest.fn(async () => new TextEncoder().encode(text).buffer),
  });
  return file;
}

function zipFile(): File {
  return new File(["zip"], "dashlane-export.zip", {
    type: "application/zip",
  });
}

async function chooseDashlane(): Promise<HTMLInputElement> {
  const trigger = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("CSV export"),
  );
  if (!(trigger instanceof HTMLButtonElement))
    throw new Error("source trigger missing");
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (node) => node.textContent?.includes("Dashlane"),
  );
  if (!(option instanceof HTMLElement))
    throw new Error("Dashlane option missing");
  await act(async () => option.click());
  const input = document.body.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("file input missing");
  return input;
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
    sourceState: "active",
    ...overrides,
  };
}

async function chooseBitwardenJson(): Promise<HTMLInputElement> {
  const trigger = [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("CSV export") ||
      button.textContent?.includes("Bitwarden JSON"),
  );
  if (!(trigger instanceof HTMLButtonElement))
    throw new Error("source trigger missing");
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (node) => node.textContent?.includes("Bitwarden JSON"),
  );
  if (!(option instanceof HTMLElement))
    throw new Error("JSON source option missing");
  await act(async () => option.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const input = document.body.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error("file input missing");
  if (!input.accept.includes("application/json"))
    throw new Error(`JSON source was not selected: ${input.accept}`);
  return input;
}

async function chooseOnePux(): Promise<HTMLInputElement> {
  const trigger = [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("CSV export") ||
      button.textContent?.includes("1Password 1PUX"),
  );
  if (!(trigger instanceof HTMLButtonElement))
    throw new Error("source trigger missing");
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (node) => node.textContent?.includes("1Password 1PUX (unencrypted export)"),
  );
  if (!(option instanceof HTMLElement))
    throw new Error("1PUX source option missing");
  await act(async () => option.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const input = document.body.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error("file input missing");
  if (!input.accept.includes(".1pux"))
    throw new Error(`1PUX source was not selected: ${input.accept}`);
  return input;
}

async function chooseKeePassXml(): Promise<HTMLInputElement> {
  const trigger = [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("CSV export") ||
      button.textContent?.includes("KeePass / KeePassXC XML"),
  );
  if (!(trigger instanceof HTMLButtonElement))
    throw new Error("source trigger missing");
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (node) => node.textContent?.includes("KeePass / KeePassXC XML"),
  );
  if (!(option instanceof HTMLElement))
    throw new Error("KeePass XML source option missing");
  await act(async () => option.click());
  const input = document.body.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error("file input missing");
  if (!input.accept.includes("application/xml"))
    throw new Error(`KeePass XML source was not selected: ${input.accept}`);
  return input;
}

function deferKeePassWorkerLoad() {
  const create = jest.fn();
  let resolve: (
    client: Awaited<ReturnType<StructuredImportSource["loadWorker"]>>,
  ) => void;
  const loadWorker = jest.fn(
    () =>
      new Promise<Awaited<ReturnType<StructuredImportSource["loadWorker"]>>>(
        (next) => {
          resolve = next;
        },
      ),
  );
  mockDeferredKeePassLoadWorker = loadWorker;
  return {
    create,
    loadWorker,
    resolve: () =>
      resolve({
        create: create as unknown as () => Worker,
        cancel: jest.fn(),
      }),
  };
}

async function startDeferredKeePassLoad(
  deferred: ReturnType<typeof deferKeePassWorkerLoad>,
): Promise<void> {
  const input = await chooseKeePassXml();
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [jsonFile("<KeePassFile/>", 14)],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((next) => setTimeout(next, 10));
  });
  expect(deferred.loadWorker).toHaveBeenCalledTimes(1);
}

describe("VaultCsvImportDialog", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    createVaultItemMock.mockReset();
    readDashlaneCsvArchiveMock.mockReset();
    mockAuthStateListener = undefined;
    mockOrganizationId = "11111111-1111-4111-8111-111111111111";
    workers = [];
    onePuxWorkers = [];
    keePassWorkers = [];
    mockDeferredKeePassLoadWorker = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("accepts a Dashlane ZIP, previews only credentials.csv, and discloses omitted CSVs", async () => {
    readDashlaneCsvArchiveMock.mockResolvedValueOnce({
      credentialsText:
        "title,username,password,url\nExample,user,secret,https://example.test",
      omittedCsvCount: 2,
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
    const input = await chooseDashlane();
    expect(input.accept).toContain(".csv");
    expect(input.accept).toContain(".zip");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [zipFile()],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(readDashlaneCsvArchiveMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ maxFileBytes: 10_000, maxRecords: 20 }),
      expect.any(AbortSignal),
    );
    expect(document.body.textContent).toContain("Row 2: Example");
    expect(document.body.textContent).toContain(
      "This Dashlane export contains 2 other CSV files that will not be imported.",
    );
    expect(document.body.textContent).not.toContain("secret");
  });

  it("retains Dashlane raw CSV imports without an archive omission notice", async () => {
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
    const input = await chooseDashlane();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [csvFile("title,password\nRaw Dashlane,secret")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(readDashlaneCsvArchiveMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Row 2: Raw Dashlane");
    expect(document.body.textContent).not.toContain("will not be imported");
  });

  it("shows the existing unavailable surface for an invalid Dashlane ZIP without secret diagnostics", async () => {
    readDashlaneCsvArchiveMock.mockRejectedValueOnce(
      new Error("The Dashlane archive is invalid."),
    );
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
    const input = await chooseDashlane();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [zipFile()],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(document.body.textContent).toContain(
      "The Dashlane archive is invalid.",
    );
    expect(document.body.textContent).not.toContain("credentials.csv");
  });

  it("aborts an active Dashlane archive read and clears its omission state when the source changes", async () => {
    let signal: AbortSignal | undefined;
    readDashlaneCsvArchiveMock.mockImplementationOnce(
      async (_file, _limits, activeSignal) => {
        signal = activeSignal;
        return await new Promise(() => undefined);
      },
    );
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
    const input = await chooseDashlane();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [zipFile()],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(signal?.aborted).toBe(false);
    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Dashlane"),
    );
    if (!(trigger instanceof HTMLButtonElement))
      throw new Error("source trigger missing");
    await act(async () => trigger.click());
    const replacement = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes("Bitwarden"),
    );
    if (!(replacement instanceof HTMLElement))
      throw new Error("replacement source missing");
    await act(async () => replacement.click());
    expect(signal?.aborted).toBe(true);
    expect(document.body.textContent).not.toContain("will not be imported");
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
    expect(document.body.textContent).not.toContain(
      "request organization changed",
    );
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

  it("retries only the unresolved CSV row with its original frozen command identity", async () => {
    createVaultItemMock
      .mockResolvedValueOnce({ id: "first", display_name: "First" } as never)
      .mockRejectedValueOnce(new VaultImportTransportError("retryable"))
      .mockResolvedValueOnce({ id: "second", display_name: "Second" } as never);
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
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await waitForCondition(
      () => document.body.textContent?.includes("Row 2: First") ?? false,
      "CSV preview did not appear",
    );
    const importButton = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Import selected records"),
    );
    if (!(importButton instanceof HTMLButtonElement))
      throw new Error("import button missing");
    await act(async () => importButton.click());
    await waitForCondition(
      () => createVaultItemMock.mock.calls.length === 2,
      "initial CSV import did not reach the retryable row",
    );
    const [, firstOptions] = createVaultItemMock.mock.calls[0] ?? [];
    const [unresolvedBody, unresolvedOptions] =
      createVaultItemMock.mock.calls[1] ?? [];
    expect(document.body.textContent).toContain(
      "Imported 1; skipped 0; failed 1.",
    );
    const retryButton = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.includes("Retry current row"),
    );
    if (!(retryButton instanceof HTMLButtonElement))
      throw new Error("retry button missing");
    await act(async () => retryButton.click());
    await waitForCondition(
      () => createVaultItemMock.mock.calls.length === 3,
      "retry did not dispatch the unresolved CSV row",
    );
    expect(createVaultItemMock).toHaveBeenCalledTimes(3);
    expect(
      createVaultItemMock.mock.calls.map(([body]) => body.display_name),
    ).toEqual(["First", "Second", "Second"]);
    expect(createVaultItemMock.mock.calls[2]?.[0]).toBe(unresolvedBody);
    expect(createVaultItemMock.mock.calls[2]?.[0]).toStrictEqual(
      unresolvedBody,
    );
    expect(createVaultItemMock.mock.calls[2]?.[1]?.idempotencyKey).toBe(
      unresolvedOptions?.idempotencyKey,
    );
    expect(createVaultItemMock.mock.calls[2]?.[1]?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(createVaultItemMock.mock.calls[2]?.[0]).not.toBe(
      createVaultItemMock.mock.calls[0]?.[0],
    );
    expect(createVaultItemMock.mock.calls[2]?.[1]?.idempotencyKey).not.toBe(
      firstOptions?.idempotencyKey,
    );
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
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    const file = jsonFile("{}");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(fetchBitwardenJsonImportLimitsMock).toHaveBeenCalled();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(workers).toHaveLength(1);
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () => mockAuthStateListener?.("SIGNED_OUT"));
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () =>
      workers[0]?.onmessage?.({
        data: {
          requestId: workers[0]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [{ ordinal: 0, title: "late" }],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("late");
  });

  it("terminates a mounted JSON worker before a SIGNED_IN actor replacement can return its draft", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () =>
      mockAuthStateListener?.("SIGNED_IN", { user: { id: "user-b" } }),
    );
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () =>
      workers[0]?.onmessage?.({
        data: {
          requestId: workers[0]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "late signed in" })],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("late signed in");
    expect(document.body.textContent).toContain("account changed");
  });

  it("keeps a loaded draft through a same-actor token refresh", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () =>
      mockAuthStateListener?.("INITIAL_SESSION", { user: { id: "user-1" } }),
    );
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
    await act(async () =>
      mockAuthStateListener?.("TOKEN_REFRESHED", { user: { id: "user-1" } }),
    );
    expect(document.body.textContent).toContain("Masked preview:");
  });

  it("refuses an oversized JSON file before reading it", async () => {
    fetchBitwardenJsonImportLimitsMock.mockResolvedValueOnce({
      maxFileBytes: 1,
      maxRecords: 20,
      maxColumns: 20,
      maxCellBytes: 1_000,
      maxFields: 202,
      maxPlaintextFieldBytes: 1_000,
      maxRequestBodyBytes: 10_000,
      maxJsonDepth: 64,
      jsonWorkerTimeoutMs: 50,
    });
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    const file = jsonFile("{}", 2);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("exceeds");
    expect(document.body.textContent).not.toContain("administrator");
  });

  it("replaces a JSON worker and ignores a late reply from the replaced worker", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () =>
      workers[0]?.onmessage?.({
        data: {
          requestId: workers[0]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "stale" })],
        },
      } as MessageEvent),
    );
    await act(async () =>
      workers[1]?.onmessage?.({
        data: {
          requestId: workers[1]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "fresh" })],
          fileNotices: [],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("stale");
    expect(document.body.textContent).toContain("fresh");
  });

  it("invalidates a mounted JSON worker on principal and request-organization changes", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "organization", organizationId: "organization-2" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    expect(workers[0]?.terminate).toHaveBeenCalled();
    await act(async () =>
      workers[0]?.onmessage?.({
        data: {
          requestId: workers[0]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "principal stale" })],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).toContain("destination changed");
    expect(document.body.textContent).not.toContain("principal stale");

    const freshInput = await chooseBitwardenJson();
    Object.defineProperty(freshInput, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      freshInput.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    mockOrganizationId = "22222222-2222-4222-8222-222222222222";
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "organization", organizationId: "organization-2" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    expect(workers[1]?.terminate).toHaveBeenCalled();
    await act(async () =>
      workers[1]?.onmessage?.({
        data: {
          requestId: workers[1]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "organization stale" })],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).toContain("request organization changed");
    expect(document.body.textContent).not.toContain("organization stale");
    expect(document.body.textContent).not.toContain("Import selected records");
  });

  it("does not resurrect a timed-out or errored JSON parse after worker cleanup", async () => {
    // THE DEADLINE IS WHAT THIS TEST IS ABOUT, so it — and only it — asks for a
    // short one. `…Once` per parse (this test posts two) rather than a standing
    // `mockResolvedValue`: this mock is NOT reset in `beforeEach`, so a standing
    // override would hand the 50ms race back to every test that runs after it.
    const shortDeadline = {
      maxFileBytes: 10_000,
      maxRecords: 20,
      maxColumns: 20,
      maxCellBytes: 1_000,
      maxFields: 202,
      maxPlaintextFieldBytes: 1_000,
      maxRequestBodyBytes: 10_000,
      maxJsonDepth: 64,
      // SHORT ENOUGH TO FIRE ON PURPOSE, LONG ENOUGH NOT TO FIRE BY ACCIDENT.
      // The first half of this test drives the ERROR path and asserts on it; at
      // 50ms the deadline beat those assertions under the full battery and the
      // screen read "took too long" where the test expected "could not be read".
      // 400ms is still a deadline this test waits out deliberately below.
      jsonWorkerTimeoutMs: 400,
    };
    fetchBitwardenJsonImportLimitsMock
      .mockResolvedValueOnce(shortDeadline)
      .mockResolvedValueOnce(shortDeadline);
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const first = workers[0];
    if (!first) throw new Error("worker missing");
    await act(async () =>
      first.onmessage?.({
        data: {
          requestId: first.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: false,
          error: "untrusted export detail",
        },
      } as MessageEvent),
    );
    expect(first.terminate).toHaveBeenCalled();
    expect(document.body.textContent).toContain("could not be read");
    expect(document.body.textContent).not.toContain("untrusted export detail");
    await act(async () =>
      first.onmessage?.({
        data: {
          requestId: first.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "error stale" })],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("error stale");

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const second = workers[1];
    if (!second) throw new Error("replacement worker missing");
    // This is the deadline behavior under test, so wait out the configured worker
    // deadline (400ms above) with margin.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(second.terminate).toHaveBeenCalled();
    expect(document.body.textContent).toContain("took too long");
    await act(async () =>
      second.onmessage?.({
        data: {
          requestId: second.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [jsonRecord({ title: "timeout stale" })],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("timeout stale");
  });

  it("shows JSON duplicate, invalid, unsupported, and deleted accounting before and after import", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[
            { displayName: "Example", loginUrls: ["https://example.test"] },
          ]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    await act(async () =>
      workers[0]?.onmessage?.({
        data: {
          requestId: workers[0]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [
            jsonRecord(),
            {
              ordinal: 1,
              title: "Invalid",
              status: "invalid",
              reason: "Bad shape",
            },
            {
              ordinal: 2,
              title: "Unsupported",
              status: "unsupported",
              reason: "Passkey",
            },
            jsonRecord({
              ordinal: 3,
              title: "Deleted",
              sourceState: "deleted",
            }),
          ],
          fileNotices: [
            { code: "unsupported_binary_definitions", count: 2 },
            { code: "deleted_tombstones", count: 1 },
          ],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).toContain(
      "0 selected; 1 skipped; 1 invalid; 1 unsupported; 1 deleted.",
    );
    expect(document.body.textContent).toContain(
      "This export includes 2 unreferenced attachment definitions that cannot be imported.",
    );
    expect(document.body.textContent).toContain(
      "This export records 1 deleted items without saved contents; these cannot be restored by importing.",
    );
    expect(document.body.textContent).toContain(
      "destination https://example.test",
    );
    const duplicateToggle = document.body.querySelector('[role="switch"]');
    if (!(duplicateToggle instanceof HTMLElement))
      throw new Error("duplicate toggle missing");
    await act(async () => duplicateToggle.click());
    expect(document.body.textContent).toContain(
      "1 selected; 0 skipped; 1 invalid; 1 unsupported; 1 deleted.",
    );
    const invalidSkip = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Skip",
    );
    if (!(invalidSkip instanceof HTMLButtonElement))
      throw new Error("invalid skip missing");
    await act(async () => invalidSkip.click());
    const approval = [...document.querySelectorAll('[role="switch"]')].find(
      (node) =>
        node.parentElement?.textContent?.includes("I approve disclosure"),
    );
    if (!(approval instanceof HTMLElement))
      throw new Error("approval toggle missing");
    await act(async () => approval.click());
    const importButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import selected records"),
    );
    if (!(importButton instanceof HTMLButtonElement))
      throw new Error("import button missing");
    createVaultItemMock.mockResolvedValueOnce({
      id: "created",
      display_name: "Example",
    } as never);
    await act(async () => {
      importButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(createVaultItemMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "Imported 1; skipped 0; failed 0. Invalid 1; unsupported 1; deleted 1.",
    );
  });

  it("retries only the unresolved JSON command with its original UUID and cursor", async () => {
    createVaultItemMock
      .mockResolvedValueOnce({ id: "first", display_name: "First" } as never)
      .mockRejectedValueOnce(new VaultImportTransportError("retryable"))
      .mockResolvedValueOnce({ id: "second", display_name: "Second" } as never);
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseBitwardenJson();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("{}")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    await act(async () =>
      workers[0]?.onmessage?.({
        data: {
          requestId: workers[0]?.postMessage.mock.calls[0]?.[0]?.requestId,
          ok: true,
          records: [
            jsonRecord({ title: "First" }),
            jsonRecord({
              ordinal: 1,
              title: "Second",
              urls: ["https://second.test"],
            }),
          ],
          fileNotices: [],
        },
      } as MessageEvent),
    );
    const approval = [...document.querySelectorAll('[role="switch"]')].find(
      (node) =>
        node.parentElement?.textContent?.includes("I approve disclosure"),
    );
    if (!(approval instanceof HTMLElement))
      throw new Error("approval toggle missing");
    await act(async () => approval.click());
    const importButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import selected records"),
    );
    if (!(importButton instanceof HTMLButtonElement))
      throw new Error("import button missing");
    await act(async () => {
      importButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(createVaultItemMock).toHaveBeenCalledTimes(2);
    const retryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Retry current row"),
    );
    if (!(retryButton instanceof HTMLButtonElement))
      throw new Error("retry button missing");
    await act(async () => {
      retryButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(createVaultItemMock).toHaveBeenCalledTimes(3);
    const calls = createVaultItemMock.mock.calls;
    expect(calls.map(([body]) => body.display_name)).toEqual([
      "First",
      "Second",
      "Second",
    ]);
    expect(calls[2]?.[0]).toEqual(calls[1]?.[0]);
    expect(calls[2]?.[1]?.idempotencyKey).toBe(calls[1]?.[1]?.idempotencyKey);
    expect(calls[0]?.[1]?.idempotencyKey).not.toBe(
      calls[1]?.[1]?.idempotencyKey,
    );
    expect(document.body.textContent).toContain(
      "Imported 2; skipped 0; failed 0.",
    );
  });

  it("posts the complete configured limits to the 1PUX worker and renders its canonical response", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseOnePux();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("zip", 3)],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const worker = onePuxWorkers[0];
    if (!worker) throw new Error("1PUX worker missing");
    const request = worker.postMessage.mock.calls[0]?.[0] as {
      requestId: string;
      limits: Record<string, number>;
    };
    expect(request.limits).toEqual({
      maxFileBytes: 10_000,
      maxRecords: 20,
      maxCellBytes: 1_000,
      maxJsonDepth: 64,
    });
    await act(async () =>
      worker.onmessage?.({
        data: {
          ok: true,
          requestId: request.requestId,
          records: [jsonRecord({ sourceState: "active" })],
          fileNotices: [
            { code: "unsupported_archive_members", count: 2 },
          ],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).toContain(
      "1 selected; 0 skipped; 0 invalid; 0 unsupported; 0 deleted; 0 archived.",
    );
    expect(document.body.textContent).toContain(
      "This export includes 2 archive files that cannot be imported.",
    );
  });

  it("cancels a 1PUX worker when the source changes and ignores its late response", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseOnePux();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("zip", 3)],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const worker = onePuxWorkers[0];
    if (!worker) throw new Error("1PUX worker missing");
    const requestId = (
      worker.postMessage.mock.calls[0]?.[0] as { requestId: string }
    ).requestId;
    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("1Password 1PUX"),
    );
    if (!(trigger instanceof HTMLButtonElement))
      throw new Error("source trigger missing");
    await act(async () => trigger.click());
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes("Bitwarden JSON"),
    );
    if (!(option instanceof HTMLElement))
      throw new Error("JSON source option missing");
    await act(async () => option.click());
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "cancel",
      requestId,
    });
    expect(worker.terminate).toHaveBeenCalled();
    await act(async () =>
      worker.onmessage?.({
        data: {
          ok: true,
          requestId,
          records: [jsonRecord({ title: "late 1pux", sourceState: "active" })],
          fileNotices: [
            { code: "unsupported_archive_members", count: 1 },
          ],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("late 1pux");
  });

  it("invalidates a 1PUX worker when the request organization changes", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "organization", organizationId: "organization-2" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseOnePux();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("zip", 3)],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const worker = onePuxWorkers[0];
    if (!worker) throw new Error("1PUX worker missing");
    const requestId = (
      worker.postMessage.mock.calls[0]?.[0] as { requestId: string }
    ).requestId;
    mockOrganizationId = "22222222-2222-4222-8222-222222222222";
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "organization", organizationId: "organization-2" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "cancel",
      requestId,
    });
    await act(async () =>
      worker.onmessage?.({
        data: {
          ok: true,
          requestId,
          records: [
            jsonRecord({ title: "organization late", sourceState: "active" }),
          ],
          fileNotices: [],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).toContain("request organization changed");
    expect(document.body.textContent).not.toContain("organization late");
  });

  it("shows only lifecycle controls represented by the loaded 1PUX records", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseOnePux();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("zip", 3)],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const worker = onePuxWorkers[0];
    if (!worker) throw new Error("1PUX worker missing");
    const requestId = (
      worker.postMessage.mock.calls[0]?.[0] as { requestId: string }
    ).requestId;
    await act(async () =>
      worker.onmessage?.({
        data: {
          ok: true,
          requestId,
          records: [jsonRecord({ sourceState: "archived" })],
          fileNotices: [],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).toContain(
      "0 selected; 0 skipped; 0 invalid; 0 unsupported; 0 deleted; 1 archived.",
    );
    expect(document.body.textContent).toContain(
      "Include archived source items",
    );
    expect(document.body.textContent).not.toContain(
      "Include deleted source items",
    );
    const archivedToggle = [
      ...document.querySelectorAll('[role="switch"]'),
    ].find((node) =>
      node.parentElement?.textContent?.includes("Include archived"),
    );
    if (!(archivedToggle instanceof HTMLElement))
      throw new Error("archived toggle missing");
    await act(async () => archivedToggle.click());
    expect(document.body.textContent).toContain(
      "1 selected; 0 skipped; 0 invalid; 0 unsupported; 0 deleted; 0 archived.",
    );
  });

  it("shows no lifecycle controls for active-only 1PUX records", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseOnePux();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("zip", 3)],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const worker = onePuxWorkers[0];
    if (!worker) throw new Error("1PUX worker missing");
    const requestId = (
      worker.postMessage.mock.calls[0]?.[0] as { requestId: string }
    ).requestId;
    await act(async () =>
      worker.onmessage?.({
        data: {
          ok: true,
          requestId,
          records: [jsonRecord({ sourceState: "active" })],
          fileNotices: [],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain(
      "Include deleted source items",
    );
    expect(document.body.textContent).not.toContain(
      "Include archived source items",
    );
  });

  it("selects KeePass XML, terminates its worker on source change, and suppresses its late completion", async () => {
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    const input = await chooseKeePassXml();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [jsonFile("<KeePassFile/>", 14)],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    });
    const worker = keePassWorkers[0];
    if (!worker) throw new Error("KeePass worker missing");
    const requestId = (
      worker.postMessage.mock.calls[0]?.[0] as { requestId: string }
    ).requestId;
    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("KeePass / KeePassXC XML"),
    );
    if (!(trigger instanceof HTMLButtonElement))
      throw new Error("source trigger missing");
    await act(async () => trigger.click());
    const replacement = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes("Bitwarden JSON"),
    );
    if (!(replacement instanceof HTMLElement))
      throw new Error("replacement source missing");
    await act(async () => replacement.click());
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "cancel",
      requestId,
    });
    expect(worker.terminate).toHaveBeenCalled();
    await act(async () =>
      worker.onmessage?.({
        data: {
          ok: true,
          requestId,
          records: [jsonRecord({ title: "late KeePass record" })],
          fileNotices: [{ code: "deleted_tombstones", count: 1 }],
        },
      } as MessageEvent),
    );
    expect(document.body.textContent).not.toContain("late KeePass record");
  });

  it("does not create or post to a deferred KeePass worker after dialog cancellation", async () => {
    const deferred = deferKeePassWorkerLoad();
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    await startDeferredKeePassLoad(deferred);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    deferred.resolve();
    await act(async () => {
      await new Promise((next) => setTimeout(next, 0));
    });
    expect(deferred.create).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("late deferred record");
  });

  it("does not create or post to a deferred KeePass worker after source change", async () => {
    const deferred = deferKeePassWorkerLoad();
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    await startDeferredKeePassLoad(deferred);
    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("KeePass / KeePassXC XML"),
    );
    if (!(trigger instanceof HTMLButtonElement))
      throw new Error("source trigger missing");
    await act(async () => trigger.click());
    const replacement = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes("Bitwarden JSON"),
    );
    if (!(replacement instanceof HTMLElement))
      throw new Error("replacement source missing");
    await act(async () => replacement.click());
    deferred.resolve();
    await act(async () => {
      await new Promise((next) => setTimeout(next, 0));
    });
    expect(deferred.create).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("late deferred record");
  });

  it("does not create or post to a deferred KeePass worker after unmount", async () => {
    const deferred = deferKeePassWorkerLoad();
    await act(async () =>
      root.render(
        <VaultCsvImportDialog
          open
          onOpenChange={jest.fn()}
          principal={{ type: "user" }}
          existingItems={[]}
          onCommitted={async () => undefined}
        />,
      ),
    );
    await startDeferredKeePassLoad(deferred);
    await act(async () => root.unmount());
    deferred.resolve();
    await act(async () => {
      await new Promise((next) => setTimeout(next, 0));
    });
    expect(deferred.create).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("late deferred record");
  });
});
