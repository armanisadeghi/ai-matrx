/**
 * THE FILE PICKER LISTS THE WHOLE LIBRARY (Arman, 2026-09-29, from the Source input's "Your
 * files": "it isn't showing all of my files, the search clearly fails to get anything other than
 * the ones in state").
 *
 * A shop owner photographed 30 products ("Product 1A.HEIC" … "Product 15B.HEIC") into My Files and
 * keeps a "Product Captures" folder. The picker's Recents stopped at 20 and its search stopped at
 * the 20 newest matches — the same rows Recents already showed — and never listed a folder, though
 * the box says "Search files and folders…". Every file and folder in the loaded library must be
 * reachable; rendering is windowed by "Show more", never truncated.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";
import { pickerRecentFiles, pickerSearch } from "../filesPickerLists";

const OPTS = { filter: "all" as const, sort: "updated" as const };

function file(i: number, name: string, folder: string): CloudFileRecord {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    fileName: name,
    filePath: `${folder}/${name}`,
    mimeType: "image/heic",
    fileSize: 2_400_000,
    updatedAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
    deletedAt: null,
    parentFolderId: null,
    originDeviceId: null,
    parentFileId: null,
    derivationKind: null,
    organizationId: null,
    source: { kind: "real" },
  } as unknown as CloudFileRecord;
}

const products: CloudFileRecord[] = [];
for (let n = 1; n <= 15; n += 1) {
  products.push(file(n * 2 - 1, `Product ${n}A.HEIC`, "My Files/prompt-attachments"));
  products.push(file(n * 2, `Product ${n}B.HEIC`, "My Files/prompt-attachments"));
}
const others = Array.from({ length: 40 }, (_, i) =>
  file(100 + i, `Invoice 2026-${String(i + 1).padStart(3, "0")}.pdf`, "Commerce Intake"),
);
const filesById = Object.fromEntries(
  [...products, ...others].map((f) => [f.id, f]),
);
const foldersById: Record<string, CloudFolderRecord> = {
  f1: {
    id: "f1",
    folderName: "Product Captures",
    folderPath: "Product Captures",
    parentId: null,
    deletedAt: null,
    source: { kind: "real" },
  } as unknown as CloudFolderRecord,
};

describe("the canonical file picker lists the whole library", () => {
  it("Recents holds every recent file, not the newest 20", () => {
    expect(pickerRecentFiles(filesById, OPTS)).toHaveLength(70);
  });

  it("a search returns every match in the library, not the 20 newest", () => {
    const { files } = pickerSearch(filesById, foldersById, "product", OPTS);
    expect(files).toHaveLength(30);
    // The oldest product photo — the one a capped list dropped — is reachable.
    expect(files.map((f) => f.fileName)).toContain("Product 1A.HEIC");
  });

  it("a search lists matching folders, as the search box promises", () => {
    const { folders } = pickerSearch(filesById, foldersById, "product", OPTS);
    expect(folders.map((f) => f.folderName)).toEqual(["Product Captures"]);
  });

  it("the picker renders these lists, with no cap of its own", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "FilesResourcePicker.tsx"),
      "utf8",
    );
    expect(src).toContain("pickerRecentFiles(");
    expect(src).toContain("pickerSearch(");
    expect(src).not.toMatch(/RECENTS_CAP|SEARCH_RESULT_LIMIT/);
  });
});
