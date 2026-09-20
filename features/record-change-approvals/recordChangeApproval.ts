/**
 * recordChangeApproval — READ THE WAIT, and nothing else.
 *
 * Under `ask` (the organization's default) an agent's change to a table that
 * ALREADY EXISTED does not happen: the `records` tool answers `applied:false`
 * with `awaiting_approval:true`, the exact change it wanted to make, why it
 * waited and how an administrator changes that. Until this module existed the
 * whole of that landed in a tool result nobody rendered, so the person the
 * agent was working for saw a sentence about waiting and had nothing to wait
 * ON — the screen named a decision and offered no way to take it.
 *
 * THIS FILE IS PURE. It turns one tool result into a typed wait, and turns a
 * wait into the platform's own `ApprovalChange` descriptor. It reaches no
 * store, reads no knob and imports nothing that does, so the whole shape can
 * be proven in a unit test with no database and no organization. Applying is
 * `applyRecordChange.ts`; drawing it is `RecordChangeApprovalCard.tsx`.
 *
 * WHY THE PROPOSED DOCUMENT IS CARRIED WHOLE. The server built a declaration
 * its own guards accept (`custom._field_shape_guard`, `custom._table_shape_guard`,
 * the parity guard), and re-deriving one from a summary is how an approved
 * change becomes a DIFFERENT change. A person approves what they were shown,
 * so what they were shown is what gets written.
 */

import type {
  ApprovalChange,
  ApprovalFieldDiff,
} from "@/features/agents/ui-first-tools/ui/approval-types";

/** What `custom.agent_change_approval` decided, as the tool carries it. */
export interface RecordChangeApprovalPolicy {
  /** `never_ask` | `ask` | `always_ask` — the organization's settled choice. */
  setting: string;
  /** Why this particular change is waiting, in the store's own sentence. */
  why: string;
  /** What an administrator does about it, in the store's own sentence. */
  howToChange: string;
  /** The machine word for the arm that decided (`existing_table_needs_a_person`, …). */
  reason: string;
}

/** A field an agent wants to add to a table that already existed. */
export interface PendingFieldChange {
  change: "field";
  /** The table the field would go on. */
  tableId: string;
  /** The field's key, as the store slugged it. */
  key: string;
  /** What a person would read on the column. */
  label: string;
  /** One of the thirteen, when the expansion named one. */
  parityType: string | null;
  /** The behaviour the store's guard reads (`text`, `number`, `relation`, …). */
  behaviour: string | null;
  /** The declaration the server built, carried whole and written unchanged. */
  declaration: Record<string, unknown>;
}

/** A table an agent wants to create while the organization asks about everything. */
export interface PendingTableChange {
  change: "table";
  /** What the table would be called. */
  name: string;
  /** The Home the table would live in. A table has to live somewhere (REC-1). */
  homeId: string | null;
  /** The field keys the table would be declared with. */
  fieldKeys: string[];
  /** The declaration the server built, carried whole and declared unchanged. */
  spec: Record<string, unknown>;
}

export interface RecordChangeWait {
  /** `field_propose` | `table_propose` — the verb that waited. */
  action: string;
  policy: RecordChangeApprovalPolicy;
  /** The tool's own sentence saying what was NOT done. */
  notDone: string;
  change: PendingFieldChange | PendingTableChange;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function policyOf(raw: Record<string, unknown>): RecordChangeApprovalPolicy | null {
  const why = asText(raw["why"]);
  const how = asText(raw["how_to_change"]);
  // A wait with no sentence for the person and no way to change the setting is
  // the dead end this card exists to remove; it is not rendered as an approval.
  if (!why || !how) return null;
  return {
    setting: asText(raw["setting"]) ?? "ask",
    why,
    howToChange: how,
    reason: asText(raw["reason"]) ?? "",
  };
}

function fieldKeysOf(spec: Record<string, unknown>): string[] {
  const declared = spec["fields"];
  if (!Array.isArray(declared)) return [];
  return declared
    .map((entry) => asRecord(entry)?.["name"])
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/**
 * The wait inside a `records` tool result, or null when there is not one.
 *
 * Deliberately strict: an ordinary result, a refusal, an applied change and a
 * half-shaped wait all answer null, because a card that can appear over a
 * change that already happened is worse than no card.
 */
export function readRecordChangeWait(result: unknown): RecordChangeWait | null {
  const body = asRecord(result);
  if (!body) return null;
  if (body["awaiting_approval"] !== true) return null;
  if (body["applied"] === true) return null;

  const policyRaw = asRecord(body["approval"]);
  if (!policyRaw) return null;
  const policy = policyOf(policyRaw);
  if (!policy) return null;

  const action = asText(body["action"]) ?? "";
  const notDone = asText(body["not_done"]) ?? "";

  const field = asRecord(body["field"]);
  const tableId = asText(body["table_id"]);
  if (field && tableId) {
    const key = asText(field["key"]);
    if (!key) return null;
    return {
      action: action || "field_propose",
      policy,
      notDone,
      change: {
        change: "field",
        tableId,
        key,
        label: asText(field["label"]) ?? key,
        parityType: asText(field["parity_type"]),
        behaviour: asText(field["type"]),
        declaration: field,
      },
    };
  }

  const spec = asRecord(body["table"]);
  if (spec) {
    const name = asText(spec["name"]);
    if (!name) return null;
    const home = asRecord(body["home"]);
    return {
      action: action || "table_propose",
      policy,
      notDone,
      change: {
        change: "table",
        name,
        homeId: asText(spec["parent_id"]) ?? asText(home?.["home_id"]) ?? null,
        fieldKeys: fieldKeysOf(spec),
        spec,
      },
    };
  }

  return null;
}

/** `day_rate` → `Day rate`, for a key the declaration gave no label for. */
function humanKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.length ? words[0]!.toUpperCase() + words.slice(1) : key;
}

/** What the column HOLDS, in a person's words rather than a store token. */
export function fieldTypeSentence(change: PendingFieldChange): string {
  const word = change.parityType ?? change.behaviour;
  if (!word) return "Text";
  return humanKey(word);
}

/**
 * The wait, as the platform's own approval descriptor.
 *
 * The card this feeds is the SAME `<ApprovalCard>` the war-room write tools and
 * the surface writeback use — one approval grammar for every agent change,
 * whether the write was going to happen in the browser or on the server.
 */
export function approvalChangeFor(
  wait: RecordChangeWait,
  options: { actor?: string | null; tableName?: string | null } = {},
): ApprovalChange {
  const actor = options.actor?.trim();
  const base = {
    verb: "add" as const,
    description: `${wait.policy.why} ${wait.policy.howToChange}`,
    ...(actor ? { actor } : {}),
  };

  if (wait.change.change === "field") {
    const fields: ApprovalFieldDiff[] = [
      { label: "Column", after: wait.change.label },
      { label: "Holds", after: fieldTypeSentence(wait.change) },
      {
        label: "Table",
        after: options.tableName?.trim() || "the table the agent was asked about",
      },
    ];
    return {
      ...base,
      entity: "column",
      title: wait.change.label,
      fields,
    };
  }

  const fields: ApprovalFieldDiff[] = [
    { label: "Table", after: wait.change.name },
    {
      label: "Columns",
      after: wait.change.fieldKeys.length
        ? wait.change.fieldKeys.map(humanKey).join(", ")
        : "none yet",
    },
  ];
  return { ...base, entity: "table", title: wait.change.name, fields };
}

/**
 * What a person reads when they keep things as they are.
 *
 * Both halves, always: the change that did NOT happen, and the one thing an
 * administrator does if this organization would rather not be asked. A decline
 * that only says "declined" teaches nobody anything.
 */
export function declinedSentence(wait: RecordChangeWait): string {
  const what =
    wait.change.change === "field"
      ? `The column ${wait.change.label} was not added.`
      : `The table ${wait.change.name} was not created.`;
  return `${what} ${wait.policy.howToChange}`;
}
