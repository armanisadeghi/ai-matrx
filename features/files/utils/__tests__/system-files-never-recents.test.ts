/**
 * SYSTEM FILES ARE OFF BY DEFAULT AND NEVER RECENTS (Arman, 2026-09-29: "By default, it should
 * never show system files unless that feature is turned on. default off. And they should never
 * show in recents anyways.").
 *
 * A recycling company runs SEO research and page captures for allgreenrecycling.com. AI Matrx files
 * what it fetched under `page-captures-<org>/…` and a stray crawl body at the person's top level,
 * each marked `metadata.system_artifact`. The owner also uploaded "Q3 pickup schedule.xlsx" and
 * "Driver roster.pdf". Recents — in the Files page and in the file picker — lists only the owner's
 * two files whatever the setting says; every other list (the Files page folder view, the sidebar
 * tree, the picker's search) shows the system files only while `files.show_system_files` is on.
 *
 * Before 2026-09-29 `isRecentActivityFile` never read the marker and `buildRows` / `pickerSearch`
 * had no setting, so the stray crawl body sat in Recents and page captures filled search.
 */
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";
import {
  pickerRecentFiles,
  pickerSearch,
} from "@/features/resource-manager/resource-picker/filesPickerLists";
import { buildRows } from "@/features/files/components/surfaces/desktop/row-data";
import {
  isListedFile,
  isListedFolderPath,
  isRecentActivityFile,
} from "../user-visible";

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

function file(
  i: number,
  filePath: string,
  metadata: Record<string, unknown> = {},
): CloudFileRecord {
  const fileName = filePath.split("/").pop() as string;
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ownerId: "me",
    fileName,
    filePath,
    mimeType: "application/octet-stream",
    fileSize: 1000,
    visibility: "private",
    metadata,
    createdAt: new Date(Date.UTC(2026, 8, 29) + i * 60_000).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 29) + i * 60_000).toISOString(),
    deletedAt: null,
    parentFolderId: null,
    originDeviceId: null,
    parentFileId: null,
    derivationKind: null,
    organizationId: null,
    source: { kind: "real" },
  } as unknown as CloudFileRecord;
}

const schedule = file(1, "Operations/Q3 pickup schedule.xlsx");
const roster = file(2, "Operations/Driver roster.pdf");
// A system file outside every machine path: only its marker says what it is.
const strayCrawl = file(3, "d133/body.html", {
  system_artifact: true,
  artifact_domain: "web_crawl",
});
const capture = file(
  4,
  `page-captures-${ORG}/scrape_parsed_page/allgreenrecycling-com/home.json.gz`,
  { system_artifact: true, artifact_domain: "page_capture" },
);
const filesById = Object.fromEntries(
  [schedule, roster, strayCrawl, capture].map((f) => [f.id, f]),
);
const captureFolder = {
  id: "folder-captures",
  ownerId: "me",
  folderName: `page-captures-${ORG}`,
  folderPath: `page-captures-${ORG}`,
  parentId: null,
  visibility: "private",
  metadata: {},
  deletedAt: null,
  source: { kind: "real" },
} as unknown as CloudFolderRecord;
const opsFolder = {
  ...captureFolder,
  id: "folder-ops",
  folderName: "Operations",
  folderPath: "Operations",
} as unknown as CloudFolderRecord;
const foldersById = { [captureFolder.id]: captureFolder, [opsFolder.id]: opsFolder };

const names = (rows: { fileName: string }[]) => rows.map((r) => r.fileName).sort();
type Row = ReturnType<typeof buildRows>["rows"][number];
const rowId = (r: Row) => (r.kind === "file" ? r.file.id : r.folder.id);
const rowName = (r: Row) => (r.kind === "file" ? r.file.fileName : r.folder.folderName);

describe("Recents never contains a system file", () => {
  it("the mirror of files.is_recent_activity refuses a system_artifact file wherever it lives", () => {
    expect(isRecentActivityFile(strayCrawl)).toBe(false);
    expect(isRecentActivityFile(capture)).toBe(false);
    expect(isRecentActivityFile(schedule)).toBe(true);
  });

  it("the file picker's Recents lists only the owner's files", () => {
    const recent = pickerRecentFiles(filesById, { filter: "all", sort: "updated" });
    expect(names(recent)).toEqual(["Driver roster.pdf", "Q3 pickup schedule.xlsx"]);
  });

  it("the Files page's Recents lists only the owner's files, even with system files shown", () => {
    for (const showSystemFiles of [false, true]) {
      const { rows } = buildRows({
        folders: [],
        files: Object.values(filesById),
        section: "all",
        searchQuery: "",
        filter: "recents",
        showSystemFiles,
        permissionsByResourceId: {},
      } as unknown as Parameters<typeof buildRows>[0]);
      expect(rows.map(rowName).sort()).toEqual([
        "Driver roster.pdf",
        "Q3 pickup schedule.xlsx",
      ]);
    }
  });
});

describe("every other list shows system files only with the setting on", () => {
  it("the one rule", () => {
    expect(isListedFile(capture, false)).toBe(false);
    expect(isListedFile(capture, true)).toBe(true);
    expect(isListedFile(schedule, false)).toBe(true);
    expect(isListedFolderPath(captureFolder.folderPath, false)).toBe(false);
    expect(isListedFolderPath(captureFolder.folderPath, true)).toBe(true);
    expect(isListedFolderPath("Operations", false)).toBe(true);
  });

  it("the file picker's search", () => {
    const off = pickerSearch(filesById, foldersById, "a", { filter: "all", sort: "name" });
    expect(off.files.some((f) => f.metadata?.system_artifact === true)).toBe(false);
    expect(off.folders.map((f) => f.id)).not.toContain(captureFolder.id);
    const on = pickerSearch(filesById, foldersById, "a", {
      filter: "all",
      sort: "name",
      showSystemFiles: true,
    });
    expect(on.files.map((f) => f.id)).toContain(capture.id);
    expect(on.folders.map((f) => f.id)).toContain(captureFolder.id);
  });

  it("the Files page folder view", () => {
    const run = (showSystemFiles: boolean) =>
      buildRows({
        folders: [captureFolder, opsFolder],
        files: Object.values(filesById),
        section: "all",
        searchQuery: "",
        filter: "all",
        showSystemFiles,
            permissionsByResourceId: {},
      } as unknown as Parameters<typeof buildRows>[0]).rows.map(rowId);
    const off = run(false);
    expect(off).not.toContain(capture.id);
    expect(off).not.toContain(strayCrawl.id);
    expect(off).not.toContain(captureFolder.id);
    expect(off).toContain(schedule.id);
    const on = run(true);
    expect(on).toContain(capture.id);
    expect(on).toContain(captureFolder.id);
  });
});

describe("the library tree keeps the marker the rule reads", () => {
  it("get_user_file_tree rows carry metadata into the store (it used to be dropped)", async () => {
    const { parseCloudTreeRow } = await import("@/features/files/redux/converters");
    const row = parseCloudTreeRow({
      kind: "file",
      id: capture.id,
      created_by: "me",
      path: capture.filePath,
      name: capture.fileName,
      metadata: { system_artifact: true, artifact_domain: "page_capture" },
    });
    expect(row && row.kind === "file" && row.metadata.system_artifact).toBe(true);
  });
});
