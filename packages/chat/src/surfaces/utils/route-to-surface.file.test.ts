import { surfaceFromPathname } from "./route-to-surface";
import { getRawManifest } from "@/features/surfaces/manifests/registry";

const F = "a73adb06-c2ca-42df-a7af-86edb71db385";

describe("the single-file page has its own surface", () => {
  it("routes /files/f/<id> to matrx-user/file", () => {
    expect(surfaceFromPathname(`/files/f/${F}`)).toBe("matrx-user/file");
    expect(surfaceFromPathname(`/files/f/${F}/`)).toBe("matrx-user/file");
  });
  it("keeps the studio and the browser on their own surfaces", () => {
    expect(surfaceFromPathname(`/files/f/${F}/studio`)).toBe("matrx-user/analysis-studio");
    expect(surfaceFromPathname("/files/all/Clients")).toBe("matrx-user/files");
  });
  it("is a registered manifest with its write targets and tools", () => {
    const m = getRawManifest("matrx-user/file");
    expect(m?.writeTargets?.map((t) => t.name)).toEqual([
      "file_name",
      "file_folder_id",
      "file_visibility",
      "file_restore_version",
    ]);
    expect(m?.clientTools?.map((t) => t.name)).toEqual(["file_open_tab", "file_go_to_page", "file_download"]);
  });
});
