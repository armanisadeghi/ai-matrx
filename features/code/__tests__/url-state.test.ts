import {
  EMPTY_CODE_WORKSPACE_URL_STATE,
  parseCodeWorkspaceUrlState,
  resolveCodeWorkspaceUrlView,
  withCodeWorkspaceUrlState,
} from "../url-state";

describe("code workspace URL state", () => {
  it("parses the complete supported route state and rejects malformed values", () => {
    expect(
      parseCodeWorkspaceUrlState(
        new URLSearchParams(
          "sandbox=s1&file=%2Fhome%2Fagent%2Fsrc%2Fapp.ts&root=%2Fhome%2Fagent&view=explorer&side=0&chat=1&history=0&bottom=1&bottomTab=ports",
        ),
      ),
    ).toEqual({
      sandboxId: "s1",
      filePath: "/home/agent/src/app.ts",
      explorerRoot: "/home/agent",
      activeView: "explorer",
      sideOpen: false,
      rightOpen: true,
      farRightOpen: false,
      bottomOpen: true,
      bottomTab: "ports",
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
        activeView: "explorer",
        sideOpen: true,
        rightOpen: false,
        farRightOpen: false,
        bottomOpen: true,
        bottomTab: "terminal",
      },
    );

    expect(result.toString()).toBe(
      "open=file-1&folder=folder-1&agentId=a&conversationId=c&view=explorer&sandbox=sandbox-1&file=%2Fworkspace%2Findex.ts&side=1&chat=0&history=0&bottom=1&bottomTab=terminal",
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
});
