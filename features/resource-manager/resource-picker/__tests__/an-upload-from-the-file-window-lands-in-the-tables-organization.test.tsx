/**
 * AN UPLOAD FROM THE ATTACHMENT FILE WINDOW LANDS IN THE TABLE'S ORGANIZATION (merged-grid
 * review 2, fix lane F item 4, found live).
 *
 * A warehouse's "Bins" table (Cascade Electronics) attached a pallet photo uploaded from its cell's
 * file window while the person was working in another organization (Harbor Dental). The window was
 * told the table's organization, but the upload carried it as `metadata.scope.organization_id`,
 * which the file handler overwrites with the ACTIVE organization — the photo was filed under Harbor
 * Dental and the store refused the attachment ("photo holds a file of this organization — upload it
 * here first"). The handler's own owner option (`organizationId`) wins over the active one.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const upload = jest.fn();
jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload: (...a: unknown[]) => upload(...a), uploading: false, error: null }),
}));
let deliver: ((files: File[]) => void) | null = null;
jest.mock("@/features/files/components/core/FileAcquisition/FileAcquisitionActions", () => ({
  FileAcquisitionActions: (props: { onFiles: (files: File[]) => void }) => {
    deliver = props.onFiles;
    return null;
  },
}));
jest.mock("@/features/files/api/assets", () => ({ compressPdfMultipart: jest.fn(), materializeAssetResult: jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { InlineUploadArea } from "../InlineUploadArea";

const CASCADE = "7ead0000-0000-4a00-8a00-00000000c001";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  upload.mockReset();
  upload.mockResolvedValue({ fileId: "f-1", url: "https://example.test/f-1", mime_type: "image/png" });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function uploadPalletPhoto(organizationId?: string) {
  await act(async () => root.render(<InlineUploadArea onSelect={() => {}} {...(organizationId ? { organizationId } : {})} />));
  const photo = new File([new Uint8Array([137, 80, 78, 71])], "bin-103-pallet.png", { type: "image/png" });
  await act(async () => {
    deliver!([photo]);
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe("InlineUploadArea organizationId", () => {
  it("hands the handler the table's organization as the owner", async () => {
    await uploadPalletPhoto(CASCADE);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).toMatchObject({ organizationId: CASCADE });
  });

  it("without one, the choke point decides (unchanged)", async () => {
    await uploadPalletPhoto();
    expect(upload.mock.calls[0][1]).not.toHaveProperty("organizationId");
  });
});
