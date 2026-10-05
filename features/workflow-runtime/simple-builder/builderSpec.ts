// features/workflow-runtime/simple-builder/builderSpec.ts
//
// The builder spec v1 — the shape aidream's compiler reads
// (`aidream/services/workflow_builder/compiler.py::BuilderSpec`). The screen edits THIS; the
// server compiles the graph from it on every save. Labels here are the screen's words.

export type RuleExpr = Record<string, unknown>;

export type TriggerEvent =
  | "record.created"
  | "record.updated"
  | "record.matches"
  | "record.archived"
  // A created record that came through that public door (`metadata.change.via`; the compiler's
  // STORE_EVENT_VIA). AGENTS-ON-DATA item 5.
  | "form.answered"
  | "booking.made";

export interface BuilderTrigger {
  event: TriggerEvent;
  table_id: string;
  operations?: ("created" | "updated" | "deleted")[];
  field_ids?: string[];
  /** record.matches: the Rule the record enters ("becomes"). */
  to?: RuleExpr | null;
}

export type ActionType =
  | "update_record"
  | "update_other_record"
  | "create_record"
  | "run_agent"
  | "call_webhook"
  | "notify_person"
  | "send_email"
  | "send_text"
  | "fill_with_ai"
  | "wait";

export type BuilderAction = { type: ActionType } & Record<string, unknown>;

export interface BuilderSpec {
  version: 1;
  trigger: BuilderTrigger;
  condition?: RuleExpr | null;
  actions: BuilderAction[];
}

export const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  "record.created": "is created",
  "record.matches": "becomes",
  "record.updated": "is updated",
  "record.archived": "is archived",
  "form.answered": "comes in from a form",
  "booking.made": "comes in from a booking",
};

export const ACTION_LABEL: Record<ActionType, string> = {
  update_record: "Update this record",
  update_other_record: "Update another record",
  create_record: "Create a record",
  run_agent: "Run an agent",
  call_webhook: "Call a webhook",
  notify_person: "Notify a person",
  send_email: "Send email",
  send_text: "Send text",
  fill_with_ai: "Fill a column with AI",
  wait: "Wait",
};

export const ACTION_ORDER: ActionType[] = [
  "create_record",
  "update_record",
  "update_other_record",
  "notify_person",
  "send_text",
  "send_email",
  "run_agent",
  "fill_with_ai",
  "call_webhook",
  "wait",
];

export function emptySpec(tableId: string): BuilderSpec {
  return {
    version: 1,
    trigger: { event: "record.matches", table_id: tableId, to: null },
    condition: null,
    actions: [],
  };
}

export function freshAction(type: ActionType, tableId: string): BuilderAction {
  switch (type) {
    case "update_record":
      return { type, values: {} };
    case "update_other_record":
      return { type, table_id: tableId, record_id: "", values: {} };
    case "create_record":
      return { type, table_id: "", values: {} };
    case "run_agent":
      return { type, agent_id: "", user_input: "" };
    case "call_webhook":
      return { type, url: "" };
    case "notify_person":
      return { type, title: "", message: "" };
    case "send_email":
      return { type, subject: "", body: "" };
    case "send_text":
      return { type, message: "" };
    case "fill_with_ai":
      return { type, field_id: "" };
    case "wait":
      return { type, seconds: 3600 };
  }
}

/** The spec as the server takes it: empty optionals dropped, the trigger's own rule kept. */
export function specForSave(spec: BuilderSpec): BuilderSpec {
  const trigger: BuilderTrigger = {
    event: spec.trigger.event,
    table_id: spec.trigger.table_id,
  };
  if (spec.trigger.event === "record.matches" && spec.trigger.to)
    trigger.to = spec.trigger.to;
  if (
    spec.trigger.event === "record.updated" &&
    spec.trigger.field_ids?.length
  ) {
    trigger.field_ids = spec.trigger.field_ids;
  }
  const actions = spec.actions.map((a) => {
    const out: BuilderAction = { type: a.type };
    for (const [k, v] of Object.entries(a)) {
      if (k === "type") continue;
      if (v === "" || v === null || v === undefined) continue;
      out[k] = v;
    }
    return out;
  });
  return { version: 1, trigger, condition: spec.condition ?? null, actions };
}

/** A placeholder the variables picker offers: what it inserts and what a person reads. */
export interface ValueChoice {
  token: string;
  label: string;
}

export function placeholder(path: string): string {
  return `{{${path}}}`;
}
