/**
 * AFTER A SCAN OPENS ANOTHER ORGANIZATION'S ASSET, EVERY LATER WRITE IN THE INTAKE SESSION GOES TO
 * THAT ASSET'S OWN ORGANIZATION (active-org law 2026-09-30, AO-024 open item).
 *
 * The scan lookup already spans every organization the person can see. The hook then wrote its
 * follow-up rows (identifiers, uploads, new items in the same batch) with the ACTIVE organization,
 * which files them beside the wrong record or is refused. Writes about an existing record carry
 * the record's org; only a session with nothing open starts new work in the active one.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACTIVE_ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const OTHER_ORG = "57f2a22b-5875-46c6-80df-437076421c28";
const BATCH = "b0000000-0000-4000-8000-000000000001";
const ASSET = "a0000000-0000-4000-8000-000000000001";

const addIdentifier = jest.fn(async (..._args: unknown[]) => undefined);
const createAsset = jest.fn();
const ensureOpenBatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => ACTIVE_ORG }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => ACTIVE_ORG }));
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: async () => ({ status: "ready", organizationId: ACTIVE_ORG }),
}));
jest.mock("@/lib/media/object-url-registry", () => ({
  createTrackedObjectUrl: () => "blob:x",
  revokeTrackedObjectUrl: () => undefined,
}));
jest.mock("@/features/media-capture/core/video-file-inspection", () => ({ inspectVideoFile: async () => ({}) }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock("@ai-matrx/browser-audio/core", () => ({ toAudioFile: () => null }));
jest.mock("../../uploads", () => ({ uploadIntakeArtifact: jest.fn() }));
jest.mock("../../labels/codes", () => ({ normalizeScannedCode: (c: string) => c.trim() }));
jest.mock("../../labels/service", () => ({
  claimLabelCode: jest.fn(),
  resolveScannedValue: async () => ({ type: "asset", assetId: ASSET }),
}));
jest.mock("../../service", () => ({
  addIdentifier: (...a: unknown[]) => (addIdentifier as jest.Mock)(...a),
  appendToBatchNotes: jest.fn(),
  createAsset: (...a: unknown[]) => createAsset(...a),
  deleteArtifact: jest.fn(),
  ensureOpenBatch: (...a: unknown[]) => ensureOpenBatch(...a),
  finishAsset: jest.fn(),
  listAssetArtifacts: async () => [],
  loadAsset: async () => ({
    id: ASSET,
    batchId: BATCH,
    organizationId: OTHER_ORG,
    trackingMode: "serialized",
    quantity: 1,
    pipelineState: "captured",
    notes: "",
    attributes: {},
    featuredArtifactId: null,
    composition: null,
    qrCode: "OTHER-1",
    version: 1,
  }),
  loadBatch: async () => ({
    id: BATCH,
    organizationId: OTHER_ORG,
    streamKind: "asset",
    captureMode: "serialized",
    label: null,
    status: "open",
    notes: null,
    version: 1,
  }),
  maxSequenceIndex: async () => 0,
  reopenAsset: async (a: unknown) => a,
  setAssetNotes: jest.fn(),
}));

import { useIntakeSession, type UseIntakeSessionResult } from "../useIntakeSession";

let container: HTMLDivElement;
let root: Root;
let session: UseIntakeSessionResult | null = null;
function Probe() {
  session = useIntakeSession();
  return null;
}
beforeEach(() => {
  addIdentifier.mockClear();
  createAsset.mockClear();
  ensureOpenBatch.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  session = null;
});

describe("intake session after a scan opens another organization's asset", () => {
  it("files a typed identifier in the asset's own organization, not the active one", async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await session!.onQrCode("OTHER-1");
    });
    await act(async () => {
      session!.addManualIdentifier("SN-42");
      await Promise.resolve();
    });
    expect(addIdentifier).toHaveBeenCalledTimes(1);
    expect(addIdentifier.mock.calls[0]?.[0]).toMatchObject({ assetId: ASSET, organizationId: OTHER_ORG, value: "SN-42" });
  });
});
