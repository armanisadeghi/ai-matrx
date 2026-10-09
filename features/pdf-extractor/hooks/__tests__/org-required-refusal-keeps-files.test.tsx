/**
 * An organization-required refusal on upload is an ordinary upload failure
 * (2026-10-09). The app always has one active organization and nothing prompts
 * for one, so the refusal shows the server's error on the files' tabs and the
 * selected files stay selected for a retry.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REFUSAL = "Select an organization before sending this request.";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: () => null,
}));
jest.mock("@ai-matrx/kit/clipboard", () => ({
  useClipboard: () => ({ copyText: jest.fn() }),
}));
jest.mock("@/lib/clipboard/copy-notify", () => ({ copyNotify: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/docprocDb", () => ({
  PROCESSED_DOCUMENTS_COLUMNS: "id",
  docprocDb: () => ({}),
}));
jest.mock("@/lib/python-client", () => ({
  getAccessTokenOrNull: async () => null,
  requestRaw: jest.fn(async () => {
    throw new OrganizationContextError("organization_context_required", REFUSAL);
  }),
}));

import { usePdfExtractor } from "@/features/pdf-extractor/hooks/usePdfExtractor";

describe("organization-required upload refusal", () => {
  it("shows the error on the file's tab and keeps the files selected", async () => {
    let api!: ReturnType<typeof usePdfExtractor>;
    function Probe() {
      api = usePdfExtractor({ loadHistory: false });
      return null;
    }
    const root: Root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));

    const file = new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" });
    await act(async () => api.setSelectedFiles([file]));
    expect(api.selectedFiles).toHaveLength(1);

    await act(async () => {
      await api.extractFiles();
    });

    expect(api.tabs).toHaveLength(1);
    expect(api.tabs[0].status).toBe("error");
    expect(api.tabs[0].error).toBe(REFUSAL);
    expect(api.selectedFiles).toEqual([file]);
    expect((api as unknown as { needsOrganization?: unknown }).needsOrganization).toBeUndefined();
    await act(async () => root.unmount());
  });
});
