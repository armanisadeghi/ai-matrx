/**
 * V2-F #3 (verifier shot 03): with no organization picked, a stored-file card
 * asked GET /files/{id}/rag-status every ~3 s with no organization header; the
 * server refused each one (400 organization_required) and a red "7 errors" pill
 * grew on the page. A file's state is read only when an organization is known
 * — the file's own, or the one the person picked; until then the card is HELD
 * for an organization (it says so, with "Choose organization") and nothing
 * is asked.
 */
const fetchFileRagStatus = jest.fn();
jest.mock("@/features/rag/api/rag-jobs", () => ({
  fetchFileRagStatus: (...args: unknown[]) => fetchFileRagStatus(...args),
}));

import { createSourceRef } from "@ai-matrx/agents/sources";
import { renderHook } from "@/test-utils/renderHook";
import type { UseProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { useSourceRecovery } from "./useSourceRecovery";
import { fileCardHeldForOrganization } from "./fileSource";
import type { SourceCardModel } from "./types";
import type { UseSourceIntakeResult } from "./useSourceIntake";
import type { UseSourceSetResult } from "./useSourceSet";

const FILE = "e7c4d481-6b4d-430a-9c5e-330b464e6c8f";

function fileCard(id: string): SourceCardModel {
  return {
    id,
    draft: { kind: "files", label: "official-ap-biology.pdf", ref: createSourceRef("file", FILE), fileId: FILE },
    status: "ready",
    error: null,
    manifest: null,
  };
}

function fakes(card: SourceCardModel) {
  const set = { sources: [card], manifest: jest.fn(), fail: jest.fn() } as unknown as UseSourceSetResult;
  const intake = { resume: jest.fn(), fileLanded: jest.fn() } as unknown as UseSourceIntakeResult;
  const runner = { jobs: [], runForCldFile: jest.fn(() => Promise.resolve()) } as unknown as UseProcessingRunner;
  return { set, intake, runner };
}

beforeEach(() => {
  jest.useFakeTimers();
  fetchFileRagStatus.mockReset();
  fetchFileRagStatus.mockResolvedValue({ state: "running", processed_document_id: null, error: null });
});
afterEach(() => jest.useRealTimers());

it("asks nothing about a file while no organization is known — the card is held", async () => {
  const card = fileCard("held-card");
  const { set, intake, runner } = fakes(card);
  const hook = await renderHook(() => useSourceRecovery(set, intake, runner, { organizationId: null }));
  await hook.act(async () => {
    jest.advanceTimersByTime(20_000);
  });
  expect(fetchFileRagStatus).not.toHaveBeenCalled();
  expect(fileCardHeldForOrganization(card, null)).toBe(true);
  await hook.unmount();
});

it("reads the file's state once an organization is picked", async () => {
  const card = fileCard("org-card");
  const { set, intake, runner } = fakes(card);
  const hook = await renderHook(() => useSourceRecovery(set, intake, runner, { organizationId: "org-1" }));
  await hook.act(async () => {
    jest.advanceTimersByTime(3_500);
  });
  expect(fetchFileRagStatus).toHaveBeenCalledWith(FILE, expect.anything());
  expect(fileCardHeldForOrganization(card, "org-1")).toBe(false);
  await hook.unmount();
});
