import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder } from "util";

jest.mock("lossless-json", () => ({
  LosslessNumber: class LosslessNumber {},
  parse: JSON.parse,
  stringify: JSON.stringify,
}));

import { VaultCsvImportDialog } from "./VaultCsvImportDialog";
import { VaultWorkspace } from "./VaultWorkspace";
import { fetchCsvImportLimits } from "../csv-import-limits";
import { createVaultItem } from "../vault-service";

let mockAuthStateListener: ((event: string) => void) | undefined;

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
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
  useAppSelector: () => "11111111-1111-4111-8111-111111111111",
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
}));

jest.mock("../vault-service", () => ({
  getVaultImportActor: jest.fn(async () => ({
    userId: "user-1",
    organizationId: "11111111-1111-4111-8111-111111111111",
  })),
  createVaultItem: jest.fn(),
  VaultImportTransportError: class VaultImportTransportError extends Error {},
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

const createVaultItemMock = jest.mocked(createVaultItem);
const fetchCsvImportLimitsMock = jest.mocked(fetchCsvImportLimits);

function csvFile(text: string): File {
  const file = new File([text], "passwords.csv", { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () =>
      Uint8Array.from([...text].map((character) => character.charCodeAt(0)))
        .buffer,
  });
  return file;
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
});
