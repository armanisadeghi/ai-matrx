import {
  CODE_PLUGIN_SOURCE_APP,
  CODING_TOOL_SOURCE_FEATURES,
  codingToolFromSource,
  isCodePluginSourceApp,
  resolveCodingTool,
} from "../lib/providerSource";

// Provenance is two levels, biggest → smaller (Arman, 2026-09-18):
// source_app = 'code-plugin' for everything from an outside coding tool, and
// the tool is the source_feature. A coding-tool slug is never a source_app.

describe("the one 'outside data' test", () => {
  it("is source_app === 'code-plugin' and nothing else", () => {
    expect(CODE_PLUGIN_SOURCE_APP).toBe("code-plugin");
    expect(isCodePluginSourceApp("code-plugin")).toBe(true);
  });

  it("never accepts a coding-tool slug as a source_app", () => {
    for (const tool of ["claude-code", "codex", "cursor", "vscode"]) {
      expect(isCodePluginSourceApp(tool)).toBe(false);
      expect(codingToolFromSource(tool, "code-editor")).toBeNull();
      expect(resolveCodingTool(tool, "code-editor", ["claude_code"])).toBeNull();
    }
  });

  it("rejects normal AI Matrx and lookalike provenance", () => {
    for (const value of [
      "matrx-frontend",
      "code-editor",
      "Code-Plugin",
      "code_plugin",
      "",
      null,
      undefined,
    ]) {
      expect(isCodePluginSourceApp(value)).toBe(false);
    }
  });
});

describe("the tool is the source_feature", () => {
  it("lists exactly the four coding tools", () => {
    expect([...CODING_TOOL_SOURCE_FEATURES].sort()).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "vscode",
    ]);
  });

  it("derives the tool from source_feature under code-plugin", () => {
    expect(codingToolFromSource("code-plugin", "claude-code")?.label).toBe(
      "Claude Code",
    );
    expect(codingToolFromSource("code-plugin", "codex")?.provider).toBe("codex");
    expect(codingToolFromSource("code-plugin", "vscode")?.label).toBe("VS Code");
  });

  it("does not treat the in-app code editor as an outside tool", () => {
    expect(codingToolFromSource("matrx-frontend", "code-editor")).toBeNull();
    expect(codingToolFromSource("code-plugin", "code-editor")).toBeNull();
  });

  it("resolves a reply row's tool from its coding-session binding", () => {
    expect(
      resolveCodingTool("code-plugin", "coding_session_reply", [
        "unknown",
        "codex",
      ])?.label,
    ).toBe("Codex");
    // No binding yet: no guess.
    expect(
      resolveCodingTool("code-plugin", "coding_session_reply", []),
    ).toBeNull();
    // source_feature wins over the binding when it names a tool.
    expect(
      resolveCodingTool("code-plugin", "cursor", ["claude_code"])?.label,
    ).toBe("Cursor");
  });
});
