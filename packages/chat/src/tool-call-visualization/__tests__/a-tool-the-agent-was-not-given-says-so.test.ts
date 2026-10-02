/**
 * A TOOL THE AGENT WAS NOT GIVEN SAYS SO (board chat, 2026-10-01).
 *
 * The agent called `board_write` — a tool it had not been offered on that
 * turn — and the server refused it before it ran (`error_type: not_allowed`).
 * The card read "Board Write failed", which tells the person the board broke.
 * It did not: the call never ran. The row says that instead.
 */
import type { ToolLifecycleEntry } from "../../agents/types/request.types";
import { getToolPhaseLabel } from "../registry/registry";

function refused(toolName: string, errorType: string | null): ToolLifecycleEntry {
  return {
    callId: "toolu_1",
    toolName,
    displayName: toolName,
    status: "error",
    arguments: {},
    startedAt: "2026-10-01T14:24:04Z",
    completedAt: "2026-10-01T14:24:04Z",
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType,
    errorMessage: `Tool '${toolName}' was not provided to the model for this request and cannot be executed.`,
    isDelegated: false,
    events: [],
  };
}

describe("a refused tool call is labelled as refused, never as failed", () => {
  it("names an unoffered tool as not available here", () => {
    const entry = refused("board_write", "not_allowed");
    expect(getToolPhaseLabel("board_write", "Board Write", "error", entry.errorMessage, entry)).toBe(
      "Board Write · not available here",
    );
  });

  it("holds for a registered tool with its own error wording too", () => {
    const entry = refused("update_plan", "not_allowed");
    expect(getToolPhaseLabel("update_plan", "Update Plan", "error", entry.errorMessage, entry)).toBe(
      "Update Plan · not available here",
    );
  });

  it("leaves a tool that ran and failed as failed", () => {
    const entry = refused("board_write", "execution");
    expect(getToolPhaseLabel("board_write", "Board Write", "error", "boom", entry)).toBe(
      "Board Write failed",
    );
  });
});
