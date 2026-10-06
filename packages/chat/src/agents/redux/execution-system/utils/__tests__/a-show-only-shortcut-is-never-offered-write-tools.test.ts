/**
 * A SHORTCUT THAT ONLY SHOWS A RESULT IS NEVER OFFERED A WRITE TOOL.
 *
 * The break (live, 2026-10-05, /notes → Summarize Content): the run was
 * offered the note's `widget_text_*` write tools and the page's
 * `apply_surface_write`, so the agent proposed rewriting the person's note
 * when all they asked for was a summary shown to them. Which tools a shortcut
 * may use is a DATABASE knob on the shortcut itself (`never_include_tools` in
 * its treatment → `AgentShortcut.neverIncludeTools`), not a list in code:
 * a show-only shortcut lists the write tools, a replace/insert shortcut (Clean
 * up webpage content) lists none and keeps them.
 *
 * SUT: the real `buildToolInjection` with the real capability providers, a real
 * mounted page with a write target, and a real widget handle. Replaced: the
 * manifest registry and the DB client.
 */

const WRITE_TARGET = {
  name: "note_content",
  label: "Note content",
  description: "The note body.",
  valueType: "string" as const,
  mode: "draft" as const,
  applyPolicy: "ask" as const,
};

jest.mock("../../../../../surfaces/runtime/registry", () => ({
  getDeclaringSurface: () => null,
  getManifest: (name: string) =>
    name === "matrx-user/notes" ? { writeTargets: [WRITE_TARGET] } : undefined,
  getSurfaceAncestry: () => [],
}));
jest.mock("../../../../../host/db", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    }),
  }),
}));

import { callbackManager } from "@ai-matrx/chat/utils/callbackManager";
import { registerSurfaceRuntime } from "../../../../../surfaces/runtime/SurfaceRuntimeContext";
import { buildToolInjection } from "../build-tool-injection";
import { isToolBlocked } from "../shortcut-tool-block";
import type { ChatRootState } from "../../../../../store/root-state";
import type { WidgetHandle } from "../../../../types/widget-handle.types";

const CONV = "conv-summarize";
const SHORTCUT = "shortcut-1";

function makeState(
  widgetHandleId: string,
  neverIncludeTools: string[] | null,
): ChatRootState {
  const agentId = "agent-summarize";
  return {
    agentDefinition: {
      agents: {
        [agentId]: {
          id: agentId,
          name: "Summarize",
          tools: [],
          customTools: [],
          mcpServers: [],
          _loadedFields: { name: true, modelId: true, tools: true },
        },
      },
    },
    conversations: {
      byConversationId: {
        [CONV]: {
          agentId,
          mandateKey: null,
          shortcutId: SHORTCUT,
          surfaceName: "matrx-user/notes",
        },
      },
    },
    agentShortcut: { shortcuts: { [SHORTCUT]: { id: SHORTCUT, neverIncludeTools } } },
    instanceClientTools: { byConversationId: {} },
    instanceUIState: { byConversationId: { [CONV]: { widgetHandleId } } },
    editorState: { byConversationId: {} },
    creatorDebug: { settings: {} },
    adminPreferences: {},
  } as unknown as ChatRootState;
}

const names = (tools: Awaited<ReturnType<typeof buildToolInjection>>["tools"]) =>
  (tools ?? []).map((t) => (t.kind === "agent" ? t.agent_id : t.name));

describe("a show-only shortcut is never offered write tools", () => {
  let handleId: string;
  let unregister: () => void;

  beforeEach(() => {
    handleId = callbackManager.registerWidgetHandle({
      applyPolicy: "auto",
      onTextReplace: () => {},
      onTextAppend: () => {},
    } satisfies WidgetHandle);
    unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/notes",
        getScope: () => ({}),
        getWriteHandlers: () => ({ [WRITE_TARGET.name]: () => {} }),
      },
      1,
    );
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    unregister();
    callbackManager.unregister(handleId);
    jest.restoreAllMocks();
  });

  it("a replace/insert shortcut (no block list) keeps the widget and page write tools", async () => {
    const result = await buildToolInjection(makeState(handleId, null), CONV);
    expect(names(result.tools)).toEqual(
      expect.arrayContaining([
        "widget_text_replace",
        "widget_text_append",
        "apply_surface_write",
      ]),
    );
    expect(result.client?.capabilities).toContain("widget-handle");
  });

  it("a show-only shortcut (apply_surface_write + widget_*) gets none of them", async () => {
    const result = await buildToolInjection(
      makeState(handleId, ["apply_surface_write", "widget_*"]),
      CONV,
    );
    const offered = names(result.tools);
    expect(offered).not.toContain("apply_surface_write");
    expect(offered.filter((n) => n.startsWith("widget_"))).toEqual([]);
    expect(result.client?.capabilities ?? []).not.toContain("widget-handle");
  });

  it("a block list blocks only what it names", async () => {
    const result = await buildToolInjection(
      makeState(handleId, ["widget_text_replace"]),
      CONV,
    );
    const offered = names(result.tools);
    expect(offered).not.toContain("widget_text_replace");
    expect(offered).toContain("widget_text_append");
    expect(offered).toContain("apply_surface_write");
  });

  it("matches exact names and trailing-* prefixes only", () => {
    expect(isToolBlocked("widget_text_patch", ["widget_*"])).toBe(true);
    expect(isToolBlocked("widget", ["widget_*"])).toBe(false);
    expect(isToolBlocked("apply_surface_write", ["apply_surface_write"])).toBe(true);
    expect(isToolBlocked("apply_surface_write_x", ["apply_surface_write"])).toBe(false);
  });
});
