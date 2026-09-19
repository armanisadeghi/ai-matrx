/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CloudUploadTab } from "./CloudUploadTab";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockDropzoneActions = jest.fn();
const mockAddImage = jest.fn();
const mockClearImages = jest.fn();
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
  }),
}));
jest.mock("@/components/image/context/SelectedImagesProvider", () => ({
  useSelectedImages: () => ({
    addImage: mockAddImage,
    clearImages: mockClearImages,
    selectionMode: "single",
  }),
}));
jest.mock("@/components/image/cloud/resolveCloudFileUrl", () => ({
  resolveCloudFileUrl: (...args: unknown[]) =>
    mockResolve(args[0], args[1] as string),
  buildCloudImageSource: (file: { id: string }, url: string) => ({
    id: file.id,
    url,
  }),
}));
jest.mock("@/features/image-studio/components/Base64DecoderShell", () => ({
  Base64DecoderShell: () => null,
}));

const imported = { fileId: "canonical-image" } as CanonicalStorageImport;

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

test("single-image cloud imports enter the same canonical selection path as uploads", async () => {
  await act(async () => {
    root.render(<CloudUploadTab defaultUploadFolderId="images-folder" />);
  });
  const props = mockDropzoneActions.mock.calls.at(-1)?.[0] as {
    multiple?: boolean;
    onStorageImported?: (files: CanonicalStorageImport[]) => Promise<void>;
  };

  expect(props.multiple).toBe(false);
  await act(async () => props.onStorageImported?.([imported]));

  expect(mockClearImages).toHaveBeenCalledTimes(1);
  expect(mockResolve).toHaveBeenCalledWith(
    expect.anything(),
    "canonical-image",
  );
  expect(mockAddImage).toHaveBeenCalledWith({
    id: "canonical-image",
    url: "blob:canonical-image",
  });
});
