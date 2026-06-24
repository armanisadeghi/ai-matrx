/**
 * getToolArtifact — does a COMPLETED tool call leave behind an openable artifact?
 *
 * Most tools fold to a single dim line when done. A few PRODUCE something the
 * user keeps working with — the agent-edited **working document** (a
 * `ctx_patch`/`context_patch` on the `working_document` key) or a saved/edited
 * **note** (`note`, `war_room_update_note`). For those, the shell shows a
 * persistent, full-width `<ArtifactResultBar>`: it advertises what was edited and
 * opens the final version in the sidebar / notes window.
 *
 * This resolver maps a completed entry → a kind-based artifact descriptor (or
 * null). Each kind carries its own open handle: a working document opens against
 * the shell's `conversationId`; a note carries its `id`. Adding a new kind = one
 * branch here + one entry in the bar's `KIND_META`.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, resultAsObject } from "../renderers/_shared";

export type ToolArtifactKind = "working_document" | "note";

export interface ToolArtifact {
  kind: ToolArtifactKind;
  /** Generic fallback label; the working-doc bar prefers the live document title. */
  title: string;
  /** Past-tense verb for the sub-label: "Edited" / "Rewrote" / "Saved" / "Updated". */
  verbPast: string;
  /** Open handle for id-based kinds (note). The working document uses the shell's conversationId. */
  id?: string;
}

const PATCH_TOOLS = new Set(["ctx_patch", "context_patch"]);
const NOTE_TOOLS = new Set(["note", "war_room_update_note"]);
const WORKING_DOC_KEY = "working_document";

function pastForPatchCommand(command: string): string {
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
  const result = resultAsObject(entry);

  // ── Working document (a patch on the `working_document` context key) ──────
  if (PATCH_TOOLS.has(tool)) {
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
      verbPast: pastForPatchCommand(command),
    };
  }

  // ── Note (saved / edited) ─────────────────────────────────────────────────
  if (NOTE_TOOLS.has(tool)) {
    // `note` → { id, label }. `war_room_update_note` → { note: { id, label } }.
    const noteObj =
      result && typeof result.note === "object" && result.note !== null
        ? (result.note as Record<string, unknown>)
        : result;
    const id =
      noteObj && typeof noteObj.id === "string" ? noteObj.id : undefined;
    if (!id) return null;
    const label =
      noteObj && typeof noteObj.label === "string" && noteObj.label
        ? noteObj.label
        : "Note";
    const append =
      getArg<string>(entry, "mode") === "append" ||
      (typeof (result as Record<string, unknown>)?.mode === "string" &&
        (result as Record<string, unknown>).mode === "append");
    return {
      kind: "note",
      title: label,
      verbPast: tool === "note" ? "Saved" : append ? "Appended to" : "Updated",
      id,
    };
  }

  return null;
}
