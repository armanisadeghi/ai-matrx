/**
 * The client speaks up about tools (TOOL-SOURCES rule L + open question 5).
 *
 *  1. With the person's auto-tools switch OFF, an attachment the agent reaches
 *     only through a tool raises the composer notice; with it ON, nothing.
 *  2. The server's tool notices (a removal, a missing tool, a dead MCP) are
 *     shown to the person, not left in telemetry.
 */

import { selectAttachmentNeedsAutoTools } from "../ComposerToolsNotice";
import { selectVisibleWarnings } from "../../../../redux/execution-system/active-requests/active-requests.selectors";
import type { ChatRootState } from "../../../../../store/root-state";

function state(opts: {
  autoTools?: boolean | null;
  agentAutoToolsDisabled?: boolean;
  resources?: Record<string, { blockType: string }>;
  googleFiles?: unknown;
  warnings?: Array<{ code: string; level: string }>;
}): ChatRootState {
  return {
    agentDefinition: {
      agents: { a: { id: "a", autoToolsDisabled: opts.agentAutoToolsDisabled ?? false } },
    },
    conversations: { byConversationId: { c: { agentId: "a" } } },
    instanceUIState: {
      byConversationId: {
        c: { builderAdvancedSettings: { autoTools: opts.autoTools ?? null } },
      },
    },
    instanceResources: { byConversationId: { c: opts.resources ?? {} } },
    instanceContext: {
      byConversationId: {
        c:
          opts.googleFiles !== undefined
            ? { __google_files: { key: "__google_files", value: opts.googleFiles } }
            : {},
      },
    },
    activeRequests: { byRequestId: { r: { warnings: opts.warnings ?? [] } } },
  } as unknown as ChatRootState;
}

describe("auto tools off: the composer says an attachment may not be fully usable", () => {
  it("a document with the switch off raises it; with the switch on it is silent", () => {
    const resources = { r1: { blockType: "processed_document" } };
    expect(selectAttachmentNeedsAutoTools(state({ autoTools: false, resources }), "c")).toBe(true);
    expect(selectAttachmentNeedsAutoTools(state({ autoTools: true, resources }), "c")).toBe(false);
    expect(selectAttachmentNeedsAutoTools(state({ resources }), "c")).toBe(false);
  });

  it("the agent's own off default counts when the person has not chosen", () => {
    expect(
      selectAttachmentNeedsAutoTools(
        state({ agentAutoToolsDisabled: true, resources: { r: { blockType: "input_table" } } }),
        "c",
      ),
    ).toBe(true);
  });

  it("a Google file pick raises it; a plain image does not", () => {
    expect(selectAttachmentNeedsAutoTools(state({ autoTools: false, googleFiles: [{ id: "f" }] }), "c")).toBe(true);
    expect(
      selectAttachmentNeedsAutoTools(
        state({ autoTools: false, resources: { r: { blockType: "image" } } }),
        "c",
      ),
    ).toBe(false);
  });
});

describe("the server's tool notices reach the person", () => {
  it("promotes tool removals, missing tools and dead MCP servers even at medium level", () => {
    const visible = selectVisibleWarnings("r")(
      state({
        warnings: [
          { code: "tools_removed_no_function_calling", level: "medium" },
          { code: "tools_missing", level: "medium" },
          { code: "mcp_server_unavailable", level: "medium" },
          { code: "some_telemetry", level: "low" },
        ],
      }),
    );
    expect(visible?.map((w) => w.code)).toEqual([
      "tools_removed_no_function_calling",
      "tools_missing",
      "mcp_server_unavailable",
    ]);
  });
});
