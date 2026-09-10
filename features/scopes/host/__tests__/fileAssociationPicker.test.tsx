/**
 * Regression test for QA F1 (feedback 35d311a9): the file-picker override's
 * pick path must ROUTE to the package's onAttach/onDetach callbacks and must
 * SCREAM when the write fails. The live defect was a DB-side 403
 * (`assoc_add` could not resolve org access for `scope_type` containers —
 * fixed in migrations/entity_access_attrs_org_scoped_ownerless_tables.sql),
 * and this host glue swallowed the failure, so picking a file looked simply
 * inert: no attach, no toast, no console error.
 *
 * Since @ai-matrx/associations 0.6.0 the failure semantics live in the
 * package (`useAssociationPickerBridge`) and the scream arrives through the
 * bound `notifier` port — which this app binds to `@/lib/toast`. The
 * behaviour under test is unchanged; the test renders the override inside a
 * real provider, exactly as `AssociationsHost` mounts it.
 *
 * What the host binding itself OWNS (and the forcing inputs below prove):
 * the name a picked file is attached under (its filename, or "File" when it
 * has none), the per-file names of an upload batch, and closing the
 * association picker when the canonical window closes.
 */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AssociationPickerProps } from "@ai-matrx/associations";
import { createAssociationsStore } from "@ai-matrx/associations/core";
import { AssociationsProvider } from "@ai-matrx/associations/react";
import type {
  FilePickerWindowProps,
  FileSelection,
} from "@/features/resource-manager/resource-picker/FilePickerWindow";
import type { UploadedFile } from "@/features/resource-manager/resource-picker/InlineUploadArea";

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

// The canonical picker window is heavy (WindowPanel). Capture the props the
// host hands it so the test can drive pick / upload / close exactly the way
// the window does.
const mockWindow: { props: FilePickerWindowProps | null } = { props: null };
jest.mock(
  "@/features/resource-manager/resource-picker/FilePickerWindow",
  () => ({
    FilePickerWindow: (props: FilePickerWindowProps) => {
      mockWindow.props = props;
      return null;
    },
  }),
);
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: () => null,
}));

import { FileAssociationPickerImpl } from "../associationsHostPortsImpl";

/**
 * The provider `AssociationsHost` mounts, minus app identity: a dataSource
 * the picker never reaches (it only calls the injected onAttach/onDetach)
 * and the notifier port bound to `@/lib/toast`, the way the real host binds
 * it — so a scream here is the same scream a user would see.
 */
const store = createAssociationsStore({
  dataSource: { rpc: async () => ({ data: null, error: null }) },
  identity: { requireUserId: () => "00000000-0000-0000-0000-000000000001" },
  errorSink: () => {},
});

function Host({ children }: { children: ReactNode }) {
  return (
    <AssociationsProvider
      store={store}
      probeSchema={false}
      notifier={{
        success: (msg: string) => toastSuccess(msg),
        error: (msg: string, opts?: unknown) => toastError(msg, opts),
      }}
    >
      {children}
    </AssociationsProvider>
  );
}

function pickedFile(fileId: string, filename: string) {
  return {
    fileId,
    url: `https://matrx-user-files.s3.us-east-1.amazonaws.com/00000000-0000-0000-0000-000000000001/${fileId}`,
    type: "image/png",
    mime_type: "image/png",
    details: {
      category: "IMAGE",
      subCategory: "png",
      filename,
      extension: "png",
      iconName: "FileImage",
    },
  } satisfies FileSelection;
}

function uploadedFile(fileId: string, name: string, filename: string) {
  return {
    name,
    fileId,
    url: `https://matrx-user-files.s3.us-east-1.amazonaws.com/00000000-0000-0000-0000-000000000001/${fileId}`,
    type: "document",
    mime_type: "application/pdf",
    details: {
      category: "DOCUMENT",
      subCategory: "pdf",
      filename,
      extension: "pdf",
      iconName: "FileText",
    },
  } satisfies UploadedFile;
}

const selection = pickedFile(
  "7a10f668-358d-4e43-ad97-d605789e475d",
  "hr-photo-probe.png",
);

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

function capturedWindow(): FilePickerWindowProps {
  if (!mockWindow.props) throw new Error("FilePickerWindow was never rendered");
  return mockWindow.props;
}

describe("FileAssociationPickerImpl pick routing (QA F1)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow.props = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderPicker(props: AssociationPickerProps) {
    act(() => {
      root.render(
        <Host>
          <FileAssociationPickerImpl {...props} />
        </Host>,
      );
    });
  }

  it("routes a pick of an unattached file to onAttach and stays silent on success", async () => {
    const props = makeProps();
    renderPicker(props);

    await act(async () => {
      await capturedWindow().onPick(selection);
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
    renderPicker(props);

    await act(async () => {
      await capturedWindow().onPick(selection);
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
    renderPicker(props);

    await act(async () => {
      await capturedWindow().onPick(selection);
    });

    expect(props.onDetach).toHaveBeenCalledWith(selection.fileId);
    expect(props.onAttach).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toContain(
      'Couldn\'t detach "hr-photo-probe.png"',
    );
  });

  it("attaches a picked file that has no filename under the name 'File'", async () => {
    const props = makeProps();
    const unnamed = pickedFile("3b9e1c4a-2d7f-4e8a-9b1c-5d6e7f8a9b0c", "");
    renderPicker(props);

    await act(async () => {
      await capturedWindow().onPick(unnamed);
    });

    expect(jest.mocked(props.onAttach).mock.calls).toEqual([
      [unnamed.fileId, "File"],
    ]);
  });

  it("attaches every uploaded file under its own local name", async () => {
    const props = makeProps();
    const report = uploadedFile(
      "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      "Q3 report (final).pdf",
      "q3-report.pdf",
    );
    const chart = uploadedFile(
      "6d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a",
      "Org chart.pdf",
      "org-chart.pdf",
    );
    renderPicker(props);

    const upload = capturedWindow().onUpload;
    if (!upload) throw new Error("the host binding offers no upload handler");
    await act(async () => {
      await upload([report, chart]);
    });

    expect(jest.mocked(props.onAttach).mock.calls).toEqual([
      [report.fileId, "Q3 report (final).pdf"],
      [chart.fileId, "Org chart.pdf"],
    ]);
  });

  it("closes the association picker when the file window closes", () => {
    const props = makeProps();
    renderPicker(props);

    act(() => {
      capturedWindow().onClose();
    });

    expect(jest.mocked(props.onOpenChange).mock.calls).toEqual([[false]]);
  });
});
