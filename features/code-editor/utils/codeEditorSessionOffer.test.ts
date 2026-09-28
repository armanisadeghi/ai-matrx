import { buildCodeEditorSessionOffer } from "./codeEditorSessionOffer";

describe("buildCodeEditorSessionOffer", () => {
  it("sends only the facts it holds, with native types", () => {
    expect(
      buildCodeEditorSessionOffer({
        language: "typescript",
        filePath: "src/app.ts",
        diagnostics: "",
        workspaceName: "shop",
        gitBranch: "main",
        gitStatus: undefined,
        otherFiles: [{ name: "util.ts", language: "typescript", content: "export {}" }],
        editorTitle: "Edit app.ts",
        contextVersion: 1,
      }),
    ).toEqual({
      language: "typescript",
      file_path: "src/app.ts",
      workspace_name: "shop",
      git_branch: "main",
      other_files: "File: util.ts (typescript)\n\nexport {}",
      editor_title: "Edit app.ts",
      context_version: 1,
    });
  });

  it("omits other_files when there are none and never sends empties", () => {
    expect(buildCodeEditorSessionOffer({ language: "python", otherFiles: [] })).toEqual({
      language: "python",
    });
    expect(buildCodeEditorSessionOffer({})).toEqual({});
  });
});
