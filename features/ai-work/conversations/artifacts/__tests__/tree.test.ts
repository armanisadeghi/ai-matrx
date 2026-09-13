import { buildArtifactTree, isHtmlArtifact, toArtifactFile } from "../tree";

function row(
  relativePath: string,
  overrides: Partial<{
    mime_type: string | null;
    metadata: Record<string, unknown> | null;
    file_path: string;
  }> = {},
) {
  const name = relativePath.split("/").pop() ?? relativePath;
  return {
    id: `id:${relativePath}`,
    file_name: name,
    file_path:
      overrides.file_path ??
      `coding-sessions/claude_code/bf9b08ed-c6a4-4471-b32b-11bddee56787/${relativePath}`,
    mime_type: overrides.mime_type ?? "text/plain",
    size_bytes: 10,
    updated_at: "2026-09-12T00:00:00Z",
    metadata:
      overrides.metadata === undefined
        ? {
            kind: "coding_session_artifact",
            cli_session_id: "bf9b08ed-c6a4-4471-b32b-11bddee56787",
            relative_path: relativePath,
          }
        : overrides.metadata,
  };
}

describe("buildArtifactTree", () => {
  it("groups files by folder with folders first and recursive counts", () => {
    const tree = buildArtifactTree([
      row("qd/page/desk-v2.html", { mime_type: "text/html" }),
      row("closed.md"),
      row("before_default.txt"),
      row("qd/notes.txt"),
      row("a/file10.txt"),
      row("a/file2.txt"),
    ]);

    expect(tree.totalFiles).toBe(6);
    expect(tree.files.map((f) => f.name)).toEqual([
      "before_default.txt",
      "closed.md",
    ]);
    expect(tree.folders.map((f) => f.path)).toEqual(["a", "qd"]);

    const qd = tree.folders[1];
    expect(qd.totalFiles).toBe(2);
    expect(qd.files.map((f) => f.name)).toEqual(["notes.txt"]);
    expect(qd.folders[0].path).toBe("qd/page");
    expect(qd.folders[0].files[0].relativePath).toBe("qd/page/desk-v2.html");

    // Natural ordering: file2 before file10.
    expect(tree.folders[0].files.map((f) => f.name)).toEqual([
      "file2.txt",
      "file10.txt",
    ]);
  });

  it("falls back to the canonical file_path when relative_path is absent", () => {
    const file = toArtifactFile(row("qd/page/desk-v2.html", { metadata: null }));
    expect(file.relativePath).toBe("qd/page/desk-v2.html");
    expect(file.name).toBe("desk-v2.html");
  });

  it("recognises HTML artifacts by MIME or extension", () => {
    expect(
      isHtmlArtifact(toArtifactFile(row("x.html", { mime_type: "text/html" }))),
    ).toBe(true);
    expect(
      isHtmlArtifact(
        toArtifactFile(row("x.html", { mime_type: "application/octet-stream" })),
      ),
    ).toBe(true);
    expect(isHtmlArtifact(toArtifactFile(row("x.md")))).toBe(false);
  });
});
