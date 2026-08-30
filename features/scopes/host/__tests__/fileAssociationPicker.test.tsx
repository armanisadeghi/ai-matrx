/**
 * Regression test for QA F1 (feedback 35d311a9): the file-picker override's
 * pick path must ROUTE to the package's onAttach/onDetach callbacks and must
 * SCREAM when the write fails. The live defect was a DB-side 403
 * (`assoc_add` could not resolve org access for `scope_type` containers —
 * fixed in migrations/entity_access_attrs_org_scoped_ownerless_tables.sql),
 * and this host glue swallowed the failure, so picking a file looked simply
 * inert: no attach, no toast, no console error.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AssociationPickerProps } from "@ai-matrx/associations";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

// The canonical picker window is heavy (WindowPanel). Capture its props so the
// test can drive `onPick` exactly the way a row click does.
type PickSelection = {
  fileId: string;
  url: string;
  type: string;
  mime_type: string;
  details: { filename: string };
};
let capturedOnPick:
  | ((selection: PickSelection) => void | "close" | Promise<void | "close">)
  | null = null;
jest.mock(
  "@/features/resource-manager/resource-picker/FilePickerWindow",
  () => ({
    FilePickerWindow: (props: {
      onPick: (
        selection: PickSelection,
      ) => void | "close" | Promise<void | "close">;
    }) => {
      capturedOnPick = props.onPick;
      return null;
    },
  }),
);
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: () => null,
}));

import { FileAssociationPickerImpl } from "../associationsHostPortsImpl";

const selection: PickSelection = {
  fileId: "7a10f668-358d-4e43-ad97-d605789e475d",
  url: "https://example.test/f",
  type: "image/png",
  mime_type: "image/png",
  details: { filename: "hr-photo-probe.png" },
};

function makeProps(
  overrides: Partial<AssociationPickerProps> = {},
): AssociationPickerProps {
  return {
    open: true,
    onOpenChange: jest.fn(),
    token: "file",
    containerLabel: "Team Members",
    orgId: "f9cb3e35-2a65-4f2a-8525-088d6551071c",
    attachedIds: new Set<string>(),
    onAttach: jest.fn(async () => ({ ok: true as const })),
    onDetach: jest.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("FileAssociationPickerImpl pick routing (QA F1)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnPick = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("routes a pick of an unattached file to onAttach and stays silent on success", async () => {
    const props = makeProps();
    act(() => {
      root.render(<FileAssociationPickerImpl {...props} />);
    });
    expect(capturedOnPick).toBeTruthy();

    await act(async () => {
      await capturedOnPick!(selection);
    });

    expect(props.onAttach).toHaveBeenCalledWith(
      selection.fileId,
      "hr-photo-probe.png",
    );
    expect(props.onDetach).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("SCREAMS when the attach write fails instead of looking inert", async () => {
    const props = makeProps({
      onAttach: jest.fn(async () => ({
        ok: false as const,
        error:
          "assoc_add: non-conveying edges require editor access to one endpoint and viewer access to the other",
      })),
    });
    act(() => {
      root.render(<FileAssociationPickerImpl {...props} />);
    });

    await act(async () => {
      await capturedOnPick!(selection);
    });

    expect(props.onAttach).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toContain(
      'Couldn\'t attach "hr-photo-probe.png"',
    );
  });

  it("routes a pick of an already-attached file to onDetach and screams on failure", async () => {
    const props = makeProps({
      attachedIds: new Set([selection.fileId]),
      onDetach: jest.fn(async () => ({
        ok: false as const,
        error: "boom",
      })),
    });
    act(() => {
      root.render(<FileAssociationPickerImpl {...props} />);
    });

    await act(async () => {
      await capturedOnPick!(selection);
    });

    expect(props.onDetach).toHaveBeenCalledWith(selection.fileId);
    expect(props.onAttach).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toContain(
      'Couldn\'t detach "hr-photo-probe.png"',
    );
  });
});
