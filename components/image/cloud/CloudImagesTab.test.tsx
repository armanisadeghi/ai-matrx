import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CloudImagesTab,
  clearForcedCloudImagesLoadError,
  cloudImagesTerminalOwnerClass,
  isForcedCloudImagesLoadError,
} from "@/components/image/cloud/CloudImagesTab";

// This suite mounts the complete client surface for the manual-retry proof.
// React 19 requires this explicit jsdom marker for nested Radix updates.
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockFiles = {
  treeStatus: "loaded",
  allFiles: [] as Array<{
    id: string;
    fileName: string;
    mimeType: string;
    deletedAt: string | null;
    updatedAt: string;
    createdAt: string;
  }>,
};
const mockDispatch = jest.fn();

jest.mock("@/components/official/SearchInput", () => ({
  SearchInput: ({
    value,
    placeholder,
  }: {
    value: string;
    placeholder: string;
  }) => (
    <div data-official-search-input="true" data-value={value}>
      {placeholder}
    </div>
  ),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: unknown) => {
    if (selector === "selectActiveUserId") return "user-1";
    if (selector === "selectTreeStatus") return mockFiles.treeStatus;
    if (selector === "selectAllFilesArray") return mockFiles.allFiles;
    return undefined;
  },
  useAppStore: () => ({}),
}));

jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectActiveUserId: "selectActiveUserId",
}));

jest.mock("@/features/files/redux/selectors", () => ({
  selectAllFilesArray: "selectAllFilesArray",
  selectTreeStatus: "selectTreeStatus",
}));

jest.mock("@/features/files/redux/thunks", () => ({
  loadUserFileTree: jest.fn(),
}));

jest.mock("@/components/image/context/SelectedImagesProvider", () => ({
  useSelectedImages: () => ({
    isSelected: jest.fn(() => false),
    toggleImage: jest.fn(),
    selectionMode: "multiple",
    addImage: jest.fn(),
    clearImages: jest.fn(),
  }),
}));

jest.mock("@/features/image-manager/browse/BrowseImageProvider", () => ({
  useBrowseAction: () => jest.fn(),
}));

jest.mock("@/features/image-manager/components/CloudFileMetadataSheet", () => ({
  CloudFileMetadataSheet: () => null,
}));

jest.mock("@ai-matrx/media/react", () => ({
  ...jest.requireActual("@ai-matrx/media/react"),
  MediaThumbnail: () => <div />,
}));

jest.mock("@/components/image/shared/ImageGrid", () => ({
  ImageGrid: () => <div />,
}));

describe("CloudImagesTab", () => {
  beforeEach(() => {
    mockFiles.treeStatus = "loaded";
    mockFiles.allFiles = [];
    mockDispatch.mockReset();
    window.history.replaceState({}, "", "/images/my-cloud");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
  });

  it("uses the official search input in the My Cloud toolbar", () => {
    const html = renderToStaticMarkup(<CloudImagesTab />);

    expect(html).toContain('data-official-search-input="true"');
    expect(html).toContain("Search your images...");
  });

  it("renders the image count as an accessible toolbar status", () => {
    mockFiles.allFiles = [
      {
        id: "file-1",
        fileName: "cover.png",
        mimeType: "image/png",
        deletedAt: null,
        updatedAt: "2026-05-07T10:00:00.000Z",
        createdAt: "2026-05-07T10:00:00.000Z",
      },
      {
        id: "file-2",
        fileName: "avatar.jpg",
        mimeType: "image/jpeg",
        deletedAt: null,
        updatedAt: "2026-05-07T09:00:00.000Z",
        createdAt: "2026-05-07T09:00:00.000Z",
      },
    ];

    const html = renderToStaticMarkup(<CloudImagesTab />);

    expect(html).toContain('aria-label="2 images loaded"');
  });

  it("surfaces a recoverable load error instead of claiming the library is empty", () => {
    mockFiles.treeStatus = "error";

    const html = renderToStaticMarkup(<CloudImagesTab />);

    expect(html).toContain("Couldn’t load your images");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No images in your cloud yet");
  });

  it("offers a route-local forced error scenario whose retry returns to live data", async () => {
    expect(
      isForcedCloudImagesLoadError("/images/my-cloud", "?data=error"),
    ).toBe(true);
    expect(
      isForcedCloudImagesLoadError("/images/all-files", "?data=error"),
    ).toBe(false);
    expect(
      clearForcedCloudImagesLoadError("/images/my-cloud", "?data=error"),
    ).toBe("/images/my-cloud");
    expect(
      clearForcedCloudImagesLoadError(
        "/images/my-cloud",
        "?view=list&data=error",
      ),
    ).toBe("/images/my-cloud?view=list");

    window.history.replaceState({}, "", "/images/my-cloud?data=error");
    const html = renderToStaticMarkup(<CloudImagesTab />);

    expect(html).toContain("Test scenario: simulated image-library load error");
    expect(html).toContain("Try again returns to your live library");

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<CloudImagesTab />);
    });
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
    });

    expect(window.location.pathname + window.location.search).toBe(
      "/images/my-cloud",
    );
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.unmount();
    });
  });

  it("reserves terminal clearance on the gallery scroll owner only while the fixed bulk toolbar is visible", () => {
    expect(cloudImagesTerminalOwnerClass(false)).not.toContain("pb-40");
    expect(cloudImagesTerminalOwnerClass(true)).toContain("pb-40");
    expect(cloudImagesTerminalOwnerClass(true)).toContain("md:pb-24");
  });
});
