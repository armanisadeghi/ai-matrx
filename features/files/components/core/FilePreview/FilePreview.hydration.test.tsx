import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { emptyFileRecord } from "@/features/files/redux/slice";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const partialFile = emptyFileRecord(
  "3d199828-214a-4d78-8aa9-d8998b61b8e5",
);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => partialFile,
}));

jest.mock("@/features/files/hooks/useEnsureCloudFile", () => ({
  useEnsureCloudFile: () => ({
    status: "loading",
    error: null,
    readError: null,
    retry: jest.fn(),
  }),
}));

jest.mock("@/features/files/hooks/useFileAsset", () => ({
  useFileAsset: () => ({
    asset: null,
    primaryVariant: null,
    isLoading: false,
    orgRequired: false,
  }),
}));

jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: () => ({ url: null, loading: false }),
}));

jest.mock("@/features/files/components/core/FileActions/useFileActions", () => ({
  useFileActions: () => ({
    download: jest.fn(),
    copyShareUrl: jest.fn(),
    delete: jest.fn(),
  }),
}));

jest.mock("@/features/pdf/hooks/useExistingPdfExtraction", () => ({
  useExistingPdfExtraction: () => ({ extract: jest.fn() }),
}));

jest.mock("@ai-matrx/media/core", () => ({
  useMediaResolution: () => ({ resolution: null }),
}));

jest.mock("./PreviewerActionBar/PreviewerActionBar", () => ({
  PreviewerActionBar: () => <div data-testid="preview-actions" />,
}));

jest.mock("./PreviewerSwitch", () => ({
  PreviewerSwitch: ({ previewKind }: { previewKind: string }) => (
    <div data-preview-kind={previewKind}>Unsupported preview</div>
  ),
}));

import { FilePreview } from "./FilePreview";

describe("FilePreview hydration", () => {
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
  });

  it("keeps a partial deep-link record in loading state until render fields arrive", () => {
    act(() => {
      root.render(<FilePreview fileId={partialFile.id} />);
    });

    expect(
      container.querySelector(
        '[role="status"][aria-label="Loading file preview"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Unsupported preview");
  });
});
