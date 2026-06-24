/**
 * getToolArtifact — does a COMPLETED tool call leave behind an openable artifact?
 *
 * Most tools fold to a single dim line when done. A few PRODUCE something the
 * user keeps working with — first and foremost the agent-edited working document
 * (a `ctx_patch` / `context_patch` on the `working_document` key). For those, the
 * shell shows a persistent, full-width `<ArtifactResultBar>` instead of the dim
 * line: it advertises what was edited and opens the final version in the sidebar.
 *
 * This resolver maps a completed entry → its artifact descriptor (or null). The
 * open handle (conversationId for the working document) is supplied by the shell,
 * which already has it — so this stays a pure read of the entry.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, resultAsObject } from "../renderers/_shared";

export type ToolArtifactKind = "working_document";

export interface ToolArtifact {
  kind: ToolArtifactKind;
  /** Generic fallback label; the bar prefers the live document title. */
  title: string;
  /** Past-tense verb for the sub-label: "Edited" / "Rewrote" / "Appended to". */
  verbPast: string;
}

const PATCH_TOOLS = new Set(["ctx_patch", "context_patch"]);
const WORKING_DOC_KEY = "working_document";

function pastForCommand(command: string): string {
  switch (command) {
    case "overwrite":
      return "Rewrote";
    case "append":
      return "Appended to";
    case "prepend":
      return "Prepended to";
    case "insert":
      return "Inserted into";
    case "str_replace":
      return "Edited";
    default:
      return "Updated";
  }
}

export function getToolArtifact(
  entry: ToolLifecycleEntry | null | undefined,
): ToolArtifact | null {
  if (!entry || entry.status !== "completed") return null;
  const tool = entry.toolName ?? "";

  if (PATCH_TOOLS.has(tool)) {
    const result = resultAsObject(entry);
    const key =
      (result && typeof result.key === "string" && result.key) ||
      getArg<string>(entry, "key") ||
      "";
    if (key !== WORKING_DOC_KEY) return null;
    const command =
      (result && typeof result.command === "string" && result.command) ||
      getArg<string>(entry, "command") ||
      "";
    return {
      kind: "working_document",
      title: "Working document",
      verbPast: pastForCommand(command),
    };
  }

  return null;
}
