import codeWorkspaceReducer, {
  getGitCommitDraftKey,
  selectGitCommitDraft,
  setActiveView,
  setGitCommitDraft,
} from "./codeWorkspaceSlice";

describe("code workspace commit drafts", () => {
  it("keeps drafts separate by sandbox and repository without changing the view", () => {
    let state = codeWorkspaceReducer(
      undefined,
      setActiveView("source-control"),
    );
    state = codeWorkspaceReducer(
      state,
      setGitCommitDraft({
        sandboxId: "sandbox-a",
        repositoryRoot: "/home/agent/repo-a",
        draft: "Fix explorer copy",
      }),
    );
    state = codeWorkspaceReducer(
      state,
      setGitCommitDraft({
        sandboxId: "sandbox-a",
        repositoryRoot: "/home/agent/repo-b",
        draft: "Fix terminal spacing",
      }),
    );

    const root = { codeWorkspace: state };
    expect(selectGitCommitDraft(root, "sandbox-a", "/home/agent/repo-a")).toBe(
      "Fix explorer copy",
    );
    expect(selectGitCommitDraft(root, "sandbox-a", "/home/agent/repo-b")).toBe(
      "Fix terminal spacing",
    );
    expect(selectGitCommitDraft(root, "sandbox-b", "/home/agent/repo-a")).toBe(
      "",
    );
    expect(state.activeView).toBe("source-control");
  });

  it("clears only the matching draft when its text is emptied", () => {
    const key = getGitCommitDraftKey("sandbox-a", "/home/agent/repo-a");
    const saved = codeWorkspaceReducer(
      undefined,
      setGitCommitDraft({
        sandboxId: "sandbox-a",
        repositoryRoot: "/home/agent/repo-a",
        draft: "Keep this isolated",
      }),
    );
    const cleared = codeWorkspaceReducer(
      saved,
      setGitCommitDraft({
        sandboxId: "sandbox-a",
        repositoryRoot: "/home/agent/repo-a",
        draft: "",
      }),
    );

    expect(saved.gitCommitDrafts[key]).toBe("Keep this isolated");
    expect(cleared.gitCommitDrafts[key]).toBeUndefined();
  });
});
