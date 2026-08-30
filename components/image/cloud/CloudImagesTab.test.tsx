import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudImagesTab } from "@/components/image/cloud/CloudImagesTab";

const mockFiles = {
  allFiles: [] as Array<{
    id: string;
    fileName: string;
    mimeType: string;
    deletedAt: string | null;
    updatedAt: string;
    createdAt: string;
  }>,
};

jest.mock("@/components/official/SearchInput", () => ({
  SearchInput: ({ value, placeholder }: { value: string; placeholder: string }) => (
    <div data-official-search-input="true" data-value={value}>
      {placeholder}
    </div>
  ),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: unknown) => {
    if (selector === "selectActiveUserId") return "user-1";
    if (selector === "selectTreeStatus") return "success";
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
    mockFiles.allFiles = [];
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
});
