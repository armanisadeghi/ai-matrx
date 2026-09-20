/** @jest-environment jsdom */

import { act, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CloudUploadTab } from "./CloudUploadTab";
import {
  SelectedImagesProvider,
  useSelectedImages,
} from "@/components/image/context/SelectedImagesProvider";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockDropzoneActions = jest.fn();
const mockResolve = jest.fn(
  async (_store: unknown, _fileId: string) => "blob:canonical-image",
);

jest.mock("@ai-matrx/media/react", () => ({
  FileUploadDropzone: ({
    actions,
    children,
  }: {
    actions: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));
jest.mock(
  "@/features/files/components/core/FileAcquisition/DropzoneAcquisitionActions",
  () => ({
    DropzoneAcquisitionActions: (props: Record<string, unknown>) => {
      mockDropzoneActions(props);
      return null;
    },
  }),
);
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => ({}),
  useAppStore: () => ({ getState: () => ({}) }),
}));
jest.mock("@/features/files/redux/selectors", () => ({
  selectAllFoldersMap: () => ({}),
  selectFileById: (_state: unknown, id: string) => ({
    id,
    fileName: "picked.png",
    mimeType: "image/png",
    fileSize: 117,
  }),
}));
jest.mock("@/components/image/cloud/resolveCloudFileUrl", () => {
  const actual = jest.requireActual(
    "@/components/image/cloud/resolveCloudFileUrl",
  );
  return {
    ...actual,
    resolveCloudFileUrl: (...args: unknown[]) =>
      mockResolve(args[0], args[1] as string),
  };
});
jest.mock("@/features/image-studio/components/Base64DecoderShell", () => ({
  Base64DecoderShell: () => null,
}));

const imported = { fileId: "canonical-image" } as CanonicalStorageImport;

function SelectionProbe() {
  const { selectedImages, setSelectionMode } = useSelectedImages();
  useEffect(() => setSelectionMode("multiple"), [setSelectionMode]);
  return (
    <output aria-label="selected-image-ids">
      {selectedImages.map((image) => image.metadata?.fileId).join(",")}
    </output>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("repeated retained delivery selects one image by canonical fileId", async () => {
  await act(async () => {
    root.render(
      <SelectedImagesProvider>
        <SelectionProbe />
        <CloudUploadTab defaultUploadFolderId="images-folder" />
      </SelectedImagesProvider>,
    );
  });
  const props = mockDropzoneActions.mock.calls.at(-1)?.[0] as {
    onStorageImported?: (files: CanonicalStorageImport[]) => Promise<void>;
  };

  await act(async () => props.onStorageImported?.([imported]));
  await act(async () => props.onStorageImported?.([imported]));

  expect(
    container.querySelector('[aria-label="selected-image-ids"]')?.textContent,
  ).toBe("canonical-image");
  expect(mockResolve).toHaveBeenCalledTimes(2);
});
