/**
 * `open_file` / `share_file` — a shape hands a saved file (by its durable
 * `file_id`) to the platform's canonical surfaces: the file preview window
 * (view, expand, copy link, download, version history) and the share window.
 * `KindImage` uses both from inside the sandbox frame, where no app component
 * can run; any component may call them.
 *
 * Input: { file_id: string; name?: string }
 * Result: { opened: true }
 */

import type {
  KindActionContext,
  KindActionDefinition,
  KindActionResult,
} from "../kind-action-context";

function parse(input: unknown): { fileId: string; name: string } | { error: string } {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  const fileId = obj?.file_id;
  if (typeof fileId !== "string" || !fileId.trim()) return { error: "This needs a saved file." };
  const name = typeof obj?.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 120) : "File";
  return { fileId: fileId.trim(), name };
}

async function openFileHandler(input: unknown, ctx: KindActionContext): Promise<KindActionResult> {
  const parsed = parse(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  ctx.openFile(parsed.fileId);
  return { ok: true, result: { opened: true } };
}

async function shareFileHandler(input: unknown, ctx: KindActionContext): Promise<KindActionResult> {
  const parsed = parse(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  ctx.shareFile(parsed.fileId, parsed.name);
  return { ok: true, result: { opened: true } };
}

export const openFileAction: KindActionDefinition = {
  key: "open_file",
  label: "Open file",
  description: "Open a saved file (by file_id) in the platform's file preview window.",
  handler: openFileHandler,
};

export const shareFileAction: KindActionDefinition = {
  key: "share_file",
  label: "Share file",
  description: "Open the platform's share window for a saved file (by file_id).",
  handler: shareFileHandler,
};
