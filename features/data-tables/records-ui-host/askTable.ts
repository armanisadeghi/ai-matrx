/**
 * THE TABLE'S ASK BOX, ANSWERED BY THE `table.ask` MANDATE (records-ui host port `askTable`).
 *
 * Which agent answers is the MANDATE, resolved inside `launchMandate` — never an agent id here. The
 * run is headless (`displayMode: "direct"`): the launch thunk waits for the run and hands back its
 * final text, which for this mandate is the structured output as JSON. Inputs ride as named
 * VARIABLES (`table_id`, `question`, `view_id`, `max_words`); nothing machine-shaped goes through
 * user_input. The package draws the answer and applies each edit against the record's version.
 *
 * `table.ask` is declared in aidream `services/table_agents/mandates.py`; a key declared after this
 * app's `@ai-matrx/agents` shipped is real on the server and absent from `MANDATE_KEYS`, so it enters
 * through `storedMandateKey` (types, never rejects; the server answers an unknown key with a 404).
 */

import { storedMandateKey } from "@ai-matrx/agents/mandates";
import type { TableAskAgentAnswer, TableAskOutcome, TableAskRequest } from "@ai-matrx/records-ui";
import type { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";

export const TABLE_ASK_MANDATE_KEY = storedMandateKey("table.ask");
export const TABLE_ASK_MAX_WORDS = "120";

type LaunchMandate = ReturnType<typeof useAgentLauncher>["launchMandate"];

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** The one JSON object in a (possibly fenced) model output, or null. */
function jsonObjectIn(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** The mandate's structured output as the package's answer shape. Plain words stay an answer. */
export function tableAskAnswerFrom(text: string): TableAskAgentAnswer {
  const body = jsonObjectIn(text);
  if (!body || (body["mode"] !== "answer" && body["mode"] !== "proposed_edits")) {
    return { mode: "answer", answer: text.trim(), cited_record_ids: [], proposed_changes: [], could_not: [] };
  }
  const changes = Array.isArray(body["proposed_changes"]) ? body["proposed_changes"] : [];
  return {
    mode: body["mode"],
    answer: typeof body["answer"] === "string" ? body["answer"] : "",
    cited_record_ids: strings(body["cited_record_ids"]),
    proposed_changes: changes.flatMap((c): TableAskAgentAnswer["proposed_changes"] => {
      if (!c || typeof c !== "object") return [];
      const row = c as Record<string, unknown>;
      if (typeof row["record_id"] !== "string" || typeof row["field_key"] !== "string") return [];
      return [{ record_id: row["record_id"], field_key: row["field_key"], from: row["from"], to: row["to"], reason: typeof row["reason"] === "string" ? row["reason"] : "" }];
    }),
    could_not: strings(body["could_not"]),
  };
}

/** Run `table.ask` for one line typed into a table's Ask box. */
export async function askTableByMandate(args: {
  launchMandate: LaunchMandate;
  organizationId: string | null;
  ask: TableAskRequest;
}): Promise<TableAskOutcome> {
  const { launchMandate, organizationId, ask } = args;
  try {
    const launched = await launchMandate(TABLE_ASK_MANDATE_KEY, {
      surfaceKey: `data:${ask.tableId}`,
      ...(organizationId ? { organizationId } : {}),
      sourceFeature: "udt",
      config: { displayMode: "direct", autoRun: true, allowChat: false, showVariablePanel: false },
      runtime: {
        variables: { table_id: ask.tableId, question: ask.question, view_id: ask.viewId, max_words: TABLE_ASK_MAX_WORDS },
      },
    });
    const text = launched.responseText?.trim() ?? "";
    if (text === "") return { ok: false, message: "No answer came back" };
    return { ok: true, answer: tableAskAnswerFrom(text) };
  } catch (thrown) {
    return { ok: false, message: thrown instanceof Error && thrown.message ? thrown.message : "The question could not be asked" };
  }
}
