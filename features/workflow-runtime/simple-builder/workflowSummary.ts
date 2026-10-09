// features/workflow-runtime/simple-builder/workflowSummary.ts
//
// ONE PLAIN SENTENCE FOR WHAT A WORKFLOW WILL DO, composed from its step cards — no AI call.
// "When a Referral's Status becomes Scheduled: create a Visit, then notify you."

import type { BuilderAction, BuilderSpec } from "./builderSpec";
import { formatDurationSeconds } from "@ai-matrx/kit/format";

export interface SummaryNames {
  /** The trigger table's name. */
  tableName: string;
  /** Column id or key → the column's name. */
  fieldName: (idOrKey: string) => string | null;
  /** Table id → the table's name. */
  otherTableName: (tableId: string) => string | null;
}

/** "Visits" → "Visit"; a name that is already singular is left alone. */
export function singular(name: string): string {
  const n = name.trim();
  if (/ies$/i.test(n)) return `${n.slice(0, -3)}${n.endsWith("IES") ? "Y" : "y"}`;
  if (/(ss|us)$/i.test(n)) return n;
  if (/s$/i.test(n)) return n.slice(0, -1);
  return n;
}

function constText(value: unknown): string {
  if (Array.isArray(value)) return value.map(constText).join(" or ");
  return String(value ?? "").trim();
}

/** The clause "Status becomes Scheduled" when the rule is one plain comparison; otherwise null. */
function becomes(to: Record<string, unknown> | null | undefined, names: SummaryNames): string | null {
  const node = to as { op?: string; args?: Array<{ field?: string; const?: unknown }> } | null | undefined;
  if (!node?.op || !node.args?.[0]?.field) return null;
  const column = names.fieldName(node.args[0].field) ?? "a column";
  const value = constText(node.args[1]?.const);
  switch (node.op) {
    case "eq":
      return value ? `${column} becomes ${value}` : `${column} changes`;
    case "ne":
      return value ? `${column} becomes anything but ${value}` : null;
    case "present":
      return `${column} is answered`;
    case "gt":
      return `${column} goes over ${value}`;
    case "lt":
      return `${column} goes under ${value}`;
    case "gte":
      return `${column} reaches ${value}`;
    case "lte":
      return `${column} drops to ${value}`;
    default:
      return null;
  }
}

function actionWords(action: BuilderAction, names: SummaryNames): string {
  const other = (id: unknown) => {
    const name = typeof id === "string" ? names.otherTableName(id) : null;
    return name ? `a ${singular(name)}` : "a record";
  };
  switch (action.type) {
    case "create_record":
      return `create ${other(action["table_id"])}`;
    case "update_record":
      return "update it";
    case "update_other_record":
      return `update ${other(action["table_id"])}`;
    case "run_agent":
      return "run an agent";
    case "call_webhook":
      return "call a web address";
    case "notify_person":
      return action["user_id"] ? "notify a person" : "notify you";
    case "send_email":
      return "send an email";
    case "send_text":
      return "send a text";
    case "fill_with_ai": {
      const column = typeof action["field_id"] === "string" ? names.fieldName(action["field_id"]) : null;
      return column ? `fill ${column} with AI` : "fill a column with AI";
    }
    case "wait": {
      const seconds = Number(action["seconds"]);
      if (!Number.isFinite(seconds) || seconds <= 0) return "wait";
      return `wait ${formatDurationSeconds(seconds, { style: "long", parts: 2 })}`;
    }
  }
}

export function workflowSummary(spec: BuilderSpec, names: SummaryNames): string {
  const thing = singular(names.tableName || "record");
  const t = spec.trigger;
  let when: string;
  switch (t.event) {
    case "record.created":
      when = `When a ${thing} is created`;
      break;
    case "record.updated":
      when = `When a ${thing} is updated`;
      break;
    case "record.archived":
      when = `When a ${thing} is archived`;
      break;
    case "form.answered":
      when = `When someone answers the form (a new ${thing})`;
      break;
    case "booking.made":
      when = `When someone books (a new ${thing})`;
      break;
    default: {
      const clause = becomes(t.to, names);
      when = clause ? `When a ${thing}'s ${clause}` : `When a ${thing} changes`;
    }
  }
  const steps = spec.actions.map((a) => actionWords(a, names));
  if (steps.length === 0) return `${when}: nothing yet`;
  return `${when}: ${steps.join(", then ")}.`;
}
