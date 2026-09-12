/**
 * A `block` SETTING MUST ACTUALLY STOP THE PRINT — and `warn` must NOT.
 *
 * The org knob `commerce.printer_certification / failed_printer_behavior` is
 * the whole gate: if the host stops consulting it (or someone "simplifies" the
 * refusal out of the click handler), the screen still shows a warning banner
 * and the print goes through anyway — a screen that lies, with real label stock
 * wasted behind it. These tests drive the REAL PrintLabelDialog and assert on
 * the real side effects (code claim + the print call), not on the banner.
 *
 * RED when the refusal is removed from `assignNew`/`reprint`, or when `blocked`
 * stops reading the knob.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import type { CertifiedPrinter } from "../types";

const FAILED_PRINTER: CertifiedPrinter = {
  id: "printer-1",
  organizationId: "org-1",
  printerMake: "Testmark",
  printerModel: "LP-9000",
  connectionNote: null,
  templateId: "avery-5163",
  status: "failed",
  certifiedBy: "user-1",
  certifiedAt: "2026-09-01T00:00:00.000Z",
  resultNotes: {
    answers: { printed_at_full_size: false },
    template_id: "avery-5163",
    template_name: "Avery 5163",
    stock_code: "5163",
    questions: [
      {
        id: "printed_at_full_size",
        question: "Is the printed page the same size as your stock?",
        answer: false,
      },
    ],
    answered_at: "2026-09-01T00:00:00.000Z",
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  version: 1,
};

let behavior: "warn" | "block" = "warn";

jest.mock("@/lib/scoped-config/useScopedKnobs", () => ({
  useScopedKnobs: () => ({
    knobs: [
      {
        feature: "commerce.printer_certification",
        key: "failed_printer_behavior",
        effective_value: behavior,
        origin: "org_override",
      },
    ],
    isLoading: false,
    error: null,
    refresh: () => undefined,
    missing: [],
  }),
}));

jest.mock("../service", () => ({
  listCertificationsForTemplate: jest.fn(async () => [FAILED_PRINTER]),
}));

const printQrLabelSheet = jest.fn(async () => ({ ok: true }));
jest.mock("@ai-matrx/print/labels", () => ({
  printQrLabelSheet,
  getLabelTemplate: () => ({ id: "avery-5163", name: "Avery 5163" }),
}));

const claimLabelCode = jest.fn(async () => true);
jest.mock("../../service", () => ({
  claimLabelCode,
  countAvailableCodes: async () => new Map<string, number>(),
  createLabelBatch: async () => "batch-1",
  findLabelCode: async () => null,
  firstAvailableCode: async () => ({ id: "code-1", value: "ABCDEFGHJKMNPQ" }),
  listOpenLabelBatches: async () => [],
  mintLabelCodes: async () => [{ id: "code-1", value: "ABCDEFGHJKMNPQ" }],
  releaseLabelCode: async () => undefined,
}));

const addIdentifier = jest.fn(async () => undefined);
jest.mock("../../../service", () => ({
  addIdentifier,
  replaceIdentifier: async () => undefined,
}));

jest.mock("@/lib/print/print-outcome-toast", () => ({
  notifyPrintOutcome: () => undefined,
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { PrintLabelDialog } from "../../components/PrintLabelDialog";

const asset = {
  id: "asset-1",
  organizationId: "org-1",
} as unknown as Parameters<typeof PrintLabelDialog>[0]["asset"];

async function renderDialog(): Promise<{ root: Root; host: HTMLElement }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <PrintLabelDialog
        asset={asset}
        identifiers={[]}
        open
        onOpenChange={() => undefined}
        onChanged={() => undefined}
      />,
    );
  });
  // let the certification + batch reads settle
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { root, host };
}

function assignButton(): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll("button"),
  ) as HTMLButtonElement[];
  const btn = buttons.find((b) => /Assign & print/i.test(b.textContent ?? ""));
  if (!btn) throw new Error("Assign & print button not rendered");
  return btn;
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

describe("failed-printer gate — the knob decides, not the code", () => {
  it("BLOCKS the print (no code claimed, nothing sent to the printer) when the org set block", async () => {
    behavior = "block";
    const { root } = await renderDialog();

    await act(async () => {
      assignButton().click();
      await Promise.resolve();
    });

    expect(claimLabelCode).not.toHaveBeenCalled();
    expect(printQrLabelSheet).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("PRINTS ANYWAY on the same failed printer when the org set warn", async () => {
    behavior = "warn";
    const { root } = await renderDialog();

    await act(async () => {
      assignButton().click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(claimLabelCode).toHaveBeenCalled();
    expect(printQrLabelSheet).toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
