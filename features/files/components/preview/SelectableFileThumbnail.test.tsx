import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const openFilePreview = jest.fn();
const onSelectedChange = jest.fn().mockResolvedValue(undefined);

jest.mock("@/features/files/components/preview/openFilePreview", () => ({
  openFilePreview: (...args: unknown[]) => openFilePreview(...args),
}));

jest.mock("@/features/files/hooks/useEnsureCloudFile", () => ({
  useEnsureCloudFile: jest.fn(),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: jest.fn().mockReturnValue(undefined),
}));

jest.mock("@/features/files/redux/selectors", () => ({
  selectFileById: jest.fn(),
}));

jest.mock(
  "@/features/files/components/core/MediaThumbnail/MediaThumbnail",
  () => ({ MediaThumbnail: () => <span data-testid="thumbnail" /> }),
);

jest.mock(
  "@/features/files/components/core/FileContextMenu/FileRightClickMenu",
  () => ({
    FileRightClickMenu: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="context-menu-wrapper">{children}</div>
    ),
  }),
);

import { SelectableFileThumbnail } from "./SelectableFileThumbnail";

const FILE_ID = "118b67d2-2f79-48a3-9216-f57b8e611bd8";

describe("SelectableFileThumbnail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    onSelectedChange.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("separates preview from selection and mounts the universal file menu", async () => {
    act(() => {
      root.render(
        <SelectableFileThumbnail
          fileId={FILE_ID}
          selected={false}
          onSelectedChange={onSelectedChange}
          alt="Product photo"
          selectLabel="Set as featured image"
        />,
      );
    });

    expect(
      container.querySelector("[data-testid='context-menu-wrapper']"),
    ).not.toBeNull();

    const preview = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Preview Product photo']",
    );
    const select = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Set as featured image']",
    );

    act(() => preview?.click());
    expect(openFilePreview).toHaveBeenCalledWith(FILE_ID);
    expect(onSelectedChange).not.toHaveBeenCalled();

    await act(async () => select?.click());
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(openFilePreview).toHaveBeenCalledTimes(1);
  });
});
