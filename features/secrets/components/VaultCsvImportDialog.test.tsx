import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { VaultCsvImportDialog } from "./VaultCsvImportDialog";
import { parseCsvFile } from "../csv-import";

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

jest.mock("../csv-import", () => ({
  parseCsvFile: jest.fn(),
  suggestedCsvMapping: (headers: string[]) => headers.map(() => "keep"),
  hasAmbiguousCsvMapping: () => false,
  isPossibleDuplicateRow: () => false,
  safeDestination: () => ({ metadata: null, host: null }),
  runCsvImportCommands: jest.fn(),
  toCsvImportCommand: jest.fn(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const parseCsvFileMock = jest.mocked(parseCsvFile);

describe("VaultCsvImportDialog", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    parseCsvFileMock.mockReset();
    mockAuthStateListener = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("renders every masked CSV row, including rows after the former five-row cutoff", async () => {
    parseCsvFileMock.mockResolvedValue({
      headers: ["title"],
      issues: 0,
      rows: Array.from({ length: 6 }, (_, index) => ({
        rowNumber: index + 2,
        cells: [`Credential ${index + 1}`],
      })),
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
      value: [new File(["masked"], "passwords.csv", { type: "text/csv" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Row 7: Imported credential 7");
  });

  it("clears a loaded preview when the signed-in account changes", async () => {
    parseCsvFileMock.mockResolvedValue({
      headers: ["title"],
      issues: 0,
      rows: [{ rowNumber: 2, cells: ["Credential"] }],
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
      value: [new File(["masked"], "passwords.csv", { type: "text/csv" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Masked preview:");
    if (!mockAuthStateListener) throw new Error("auth listener missing");
    await act(async () => mockAuthStateListener?.("SIGNED_OUT"));
    expect(document.body.textContent).not.toContain("Masked preview:");
    expect(document.body.textContent).toContain("account changed");
  });
});
