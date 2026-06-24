import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Parse the `document` tool result. Read/create/update return
 * `{ action, document_id, name, title, text }`. `text` is the rendered document
 * body (markdown + render blocks); absent on some non-read actions.
 */
export interface ParsedDocument {
  id: string | null;
  title: string | null;
  text: string | null;
  action: string | null;
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

export function parseDocument(entry: ToolLifecycleEntry): ParsedDocument {
  const r = resultAsObject(entry) ?? {};
  return {
    id: asStr(r.document_id) ?? asStr(r.id) ?? asStr(getArg<string>(entry, "id")),
    // `name` is the user-facing document name; `title` is the inner heading.
    title: asStr(r.name) ?? asStr(r.title),
    text: asStr(r.text),
    action: asStr(r.action),
  };
}
