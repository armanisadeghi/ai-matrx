/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DropzoneAcquisitionActions } from "./DropzoneAcquisitionActions";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockFileAcquisitionActions = jest.fn();

jest.mock("@ai-matrx/media/core", () => ({
  useMediaUpload: () => ({ uploadMany: jest.fn() }),
}));
jest.mock("./FileAcquisitionActions", () => ({
  FileAcquisitionActions: (props: Record<string, unknown>) => {
    mockFileAcquisitionActions(props);
    return null;
  },
}));

const imported = { fileId: "canonical-image" } as CanonicalStorageImport;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockFileAcquisitionActions.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("threads single selection and canonical provider delivery through the dropzone adapter", async () => {
  const onStorageImported = jest.fn();
  await act(async () => {
    root.render(
      <DropzoneAcquisitionActions
        multiple={false}
        onStorageImported={onStorageImported}
      />,
    );
  });

  const props = mockFileAcquisitionActions.mock.calls.at(-1)?.[0] as {
    multiple?: boolean;
    onStorageImported?: (files: CanonicalStorageImport[]) => Promise<void>;
  };
  expect(props.multiple).toBe(false);
  await props.onStorageImported?.([imported]);
  expect(onStorageImported).toHaveBeenCalledWith([imported]);
});
