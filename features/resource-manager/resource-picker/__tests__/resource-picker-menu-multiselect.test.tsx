import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: <T,>(selector: (state: object) => T) => selector({}),
}));

jest.mock("@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas", () => ({
  useOpenCloudBrowserCanvas: () => jest.fn(),
}));

jest.mock("../useRunControlCounts", () => ({
  useRunControlCounts: () => ({}),
}));

jest.mock("../FilesResourcePicker", () => ({
  FilesResourcePicker: ({
    onSelect,
    onDeselect,
    selectionMode,
  }: {
    onSelect: (selection: object) => Promise<boolean | void>;
    onDeselect: (selection: object) => Promise<boolean | void>;
    selectionMode: "single" | "multiple";
  }) => (
    <div data-selection-mode={selectionMode}>
      <button
        type="button"
        onClick={() =>
          void onSelect({
            fileId: "file-1",
            url: "/api/files/file-1/inline",
            type: "image/jpeg",
            mime_type: "image/jpeg",
            details: { filename: "photo.jpg" },
          })
        }
      >
        Pick stored file
      </button>
      <button
        type="button"
        onClick={() =>
          void onDeselect({
            fileId: "file-1",
            url: "/api/files/file-1/inline",
            type: "image/jpeg",
            mime_type: "image/jpeg",
            details: { filename: "photo.jpg" },
          })
        }
      >
        Unpick stored file
      </button>
    </div>
  ),
}));

import { ResourcePickerMenu } from "../ResourcePickerMenu";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function openFilesAndPick(): Promise<void> {
  const filesButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Files",
  );
  expect(filesButton).toBeDefined();
  act(() => filesButton?.click());

  const pickButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Pick stored file",
  );
  expect(pickButton).toBeDefined();
  await act(async () => pickButton?.click());
}

it("keeps list pickers open after a successful pick in the default multiple mode", async () => {
  const onResourceSelected = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();

  act(() => {
    root.render(
      <ResourcePickerMenu
        onResourceSelected={onResourceSelected}
        onClose={onClose}
      />,
    );
  });

  await openFilesAndPick();

  expect(onResourceSelected).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(
    container.querySelector('[data-selection-mode="multiple"]'),
  ).not.toBeNull();
});

it("preserves one-and-done behavior for explicitly single-value hosts", async () => {
  const onResourceSelected = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();

  act(() => {
    root.render(
      <ResourcePickerMenu
        selectionMode="single"
        onResourceSelected={onResourceSelected}
        onClose={onClose}
      />,
    );
  });

  await openFilesAndPick();

  expect(onResourceSelected).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(
    container.querySelector('[data-selection-mode="single"]'),
  ).not.toBeNull();
});

it("forwards file unchecks to the host without closing the picker", async () => {
  const onResourceSelected = jest.fn().mockResolvedValue(true);
  const onResourceDeselected = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();

  act(() => {
    root.render(
      <ResourcePickerMenu
        onResourceSelected={onResourceSelected}
        onResourceDeselected={onResourceDeselected}
        onClose={onClose}
      />,
    );
  });

  const filesButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Files",
  );
  act(() => filesButton?.click());

  const unpickButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Unpick stored file",
  );
  await act(async () => unpickButton?.click());

  expect(onResourceDeselected).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "file",
      data: expect.objectContaining({ fileId: "file-1" }),
    }),
  );
  expect(onClose).not.toHaveBeenCalled();
});
