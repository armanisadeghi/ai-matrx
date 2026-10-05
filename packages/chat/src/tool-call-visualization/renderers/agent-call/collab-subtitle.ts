/**
 * The folded header line of a collaboration `agent_call`: the specialist + a
 * snippet of its answer. A kind answer (text, a stored preview of it, or a
 * structured value) reads as its one-line label — never its JSON
 * (KIND_NEVER_RAW_CHECKLIST S1, round 4).
 */
import { kindTextLabel } from "@host/features/content-ir/surfaces/kind-text-label";
import { deriveInstanceTitle } from "@host/features/content-ir/studio/instance-title";
import { humanizeKind } from "@host/features/content-ir/kinds/kind-markdown-utils";

import type { ToolLifecycleEntry } from "../../../agents/types/request.types";
import { getCollabCallInfo } from "./collab";

const MAX = 90;

function valueLabel(value: Record<string, unknown>): string {
  const kind = typeof value.__kind === "string" ? value.__kind.trim() : "";
  const title = deriveInstanceTitle(value);
  if (!kind) return title ?? "";
  const name = humanizeKind(kind);
  const line = title ? `${name} · ${title}` : name;
  return line.length > MAX ? `${line.slice(0, MAX - 1).trimEnd()}…` : line;
}

export function collabHeaderSubtitle(entry: ToolLifecycleEntry): string | null {
  const collab = getCollabCallInfo(entry);
  if (!collab) return null;
  const agent = collab.agentName;
  if (entry.status === "completed") {
    const short = collab.resultText
      ? kindTextLabel(collab.resultText, MAX)
      : collab.resultValue
        ? valueLabel(collab.resultValue)
        : "";
    if (short) return agent ? `${agent} — ${short}` : short;
  }
  return agent ?? "reviewing a conversation";
}
