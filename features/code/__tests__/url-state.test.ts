import {
  EMPTY_CODE_WORKSPACE_URL_STATE,
  parseCodeWorkspaceUrlState,
  resolveCodeWorkspaceExplorerSandboxMode,
  resolveCodeWorkspaceUrlView,
  withCodeWorkspaceUrlState,
} from "../url-state";
import codeWorkspaceReducer, {
  setActiveSandbox,
  setActiveRepositoryRoot,
  setActiveSandboxId,
  setExplorerSandboxMode,
} from "../redux/codeWorkspaceSlice";

describe("code workspace URL state", () => {
  it("parses the complete supported route state and rejects malformed values", () => {
    expect(
      parseCodeWorkspaceUrlState(
        new URLSearchParams(
          "sandbox=s1&file=%2Fhome%2Fagent%2Fsrc%2Fapp.ts&root=%2Fhome%2Fagent&view=explorer&side=0&chat=1&history=0&bottom=1&bottomTab=ports&sandboxPane=open",
        ),
      ),
    ).toEqual({
      sandboxId: "s1",
      filePath: "/home/agent/src/app.ts",
      explorerRoot: "/home/agent",
      repositoryRoot: null,
      activeView: "explorer",
      sideOpen: false,
      rightOpen: true,
      farRightOpen: false,
      bottomOpen: true,
      bottomTab: "ports",
      explorerSandboxMode: "open",
    });

    expect(
      parseCodeWorkspaceUrlState(
        new URLSearchParams("file=%2Fhome%2F..%2Fsecret&root=home&view=nope&side=true&bottomTab=oops"),
      ),
    ).toEqual(EMPTY_CODE_WORKSPACE_URL_STATE);
  });

  it("preserves canonical library and chat links while updating only workspace keys", () => {
    const result = withCodeWorkspaceUrlState(
      new URLSearchParams("open=file-1&folder=folder-1&agentId=a&conversationId=c&view=library"),
      {
        sandboxId: "sandbox-1",
        filePath: "/workspace/index.ts",
        explorerRoot: null,
        repositoryRoot: "/workspace/repo",
        activeView: "explorer",
        sideOpen: true,
        rightOpen: false,
        farRightOpen: false,
        bottomOpen: true,
        bottomTab: "terminal",
        explorerSandboxMode: "hidden",
      },
    );

    expect(result.toString()).toBe(
      "open=file-1&folder=folder-1&agentId=a&conversationId=c&view=explorer&sandbox=sandbox-1&file=%2Fworkspace%2Findex.ts&side=1&chat=0&history=0&bottom=1&bottomTab=terminal&sandboxPane=hidden&repo=%2Fworkspace%2Frepo",
    );
  });

  it("removes absent workspace values without removing unrelated query parameters", () => {
    const result = withCodeWorkspaceUrlState(
      new URLSearchParams("open=file-1&view=library&sandbox=s1&file=%2Fa.ts"),
      EMPTY_CODE_WORKSPACE_URL_STATE,
    );
    expect(result.toString()).toBe("open=file-1");
  });

  it("defaults a sandbox to Explorer while preserving canonical Library doors and explicit views", () => {
    const sandbox = parseCodeWorkspaceUrlState(new URLSearchParams("sandbox=s1"));
    expect(resolveCodeWorkspaceUrlView(sandbox, new URLSearchParams("sandbox=s1"))).toBe("explorer");
    expect(resolveCodeWorkspaceUrlView(sandbox, new URLSearchParams("sandbox=s1&open=file-1"))).toBe("library");
    expect(resolveCodeWorkspaceUrlView(
      parseCodeWorkspaceUrlState(new URLSearchParams("sandbox=s1&view=run")),
      new URLSearchParams("sandbox=s1&view=run"),
    )).toBe("run");
  });

  it("round-trips an active sandbox pane mode and defaults bare sandbox links to collapsed", () => {
    const restored = parseCodeWorkspaceUrlState(
      new URLSearchParams("sandbox=s1&sandboxPane=open&repo=%2Fworkspace%2Frepo"),
    );
    expect(restored.explorerSandboxMode).toBe("open");
    expect(restored.repositoryRoot).toBe("/workspace/repo");
    expect(
      withCodeWorkspaceUrlState(new URLSearchParams("agentId=a"), restored).toString(),
    ).toBe("agentId=a&sandbox=s1&sandboxPane=open&repo=%2Fworkspace%2Frepo");

    const bareSandbox = parseCodeWorkspaceUrlState(new URLSearchParams("sandbox=s1"));
    expect(resolveCodeWorkspaceExplorerSandboxMode(bareSandbox)).toBe("collapsed");
    expect(
      parseCodeWorkspaceUrlState(new URLSearchParams("sandboxPane=wide"))
        .explorerSandboxMode,
    ).toBeNull();
  });

  it("keeps the sandbox split state in the workspace contract", () => {
    const initial = codeWorkspaceReducer(undefined, { type: "test" });
    expect(initial.explorerSandboxMode).toBe("collapsed");
    expect(
      codeWorkspaceReducer(initial, setExplorerSandboxMode("hidden"))
        .explorerSandboxMode,
    ).toBe("hidden");
  });

  it("resets a prior pane choice to the compact default when leaving a sandbox", () => {
    const hidden = codeWorkspaceReducer(
      undefined,
      setExplorerSandboxMode("hidden"),
    );
    expect(
      codeWorkspaceReducer(hidden, setExplorerSandboxMode("collapsed"))
        .explorerSandboxMode,
    ).toBe("collapsed");
  });

  it("clears the selected repository whenever the sandbox changes", () => {
    const withRepository = codeWorkspaceReducer(
      undefined,
      setActiveRepositoryRoot("/workspace/repo"),
    );
    expect(
      codeWorkspaceReducer(withRepository, setActiveSandboxId("sandbox-2"))
        .activeRepositoryRoot,
    ).toBeNull();
  });

  it("preserves the repository when current sandbox metadata refreshes", () => {
    const withRepository = codeWorkspaceReducer(
      codeWorkspaceReducer(undefined, setActiveSandboxId("sandbox-2")),
      setActiveRepositoryRoot("/workspace/repo"),
    );
    const refreshed = codeWorkspaceReducer(
      withRepository,
      setActiveSandbox({ id: "sandbox-2", proxy_url: null } as never),
    );
    expect(refreshed.activeRepositoryRoot).toBe("/workspace/repo");
  });
});
