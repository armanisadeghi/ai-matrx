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

/** One person who may decide this, as the one ladder resolved them. */
export interface RecordChangeApprover {
  userId: string;
  /** What they are called. Never an id — a card that shows a uuid names nobody. */
  name: string | null;
  /** Why they can decide it: asked by name, admin on this, or owner of the organization. */
  why: string | null;
}

/** Records an agent wants to add to a table that already existed. */
export interface PendingRecordsChange {
  change: "records";
  /** The table the rows would go in. */
  tableId: string;
  /** The rows, exactly as the agent sent them and exactly as they will be written. */
  rows: Record<string, unknown>[];
}

/** Values an agent wants to change on a record in a table that already existed. */
export interface PendingPatchChange {
  change: "patch";
  /** The table the record lives in. */
  tableId: string;
  /** The record being changed. */
  recordId: string;
  /** The values, exactly as they will be written. */
  patch: Record<string, unknown>;
}

/** A record an agent wants to move to the trash, in a table that already existed. */
export interface PendingDeleteChange {
  change: "delete";
  tableId: string;
  recordId: string;
}

export interface RecordChangeWait {
  /** `field_propose` | `table_propose` | `record_write` — the verb that waited. */
  action: string;
  policy: RecordChangeApprovalPolicy;
  /**
   * The queue row this wait IS — `custom.record`, `data_class='work_approval'`.
   *
   * Null only for a change nothing could be filed against (a table that does
   * not exist yet, under `always_ask`). The card offers no decision then, and
   * says why, because a button that cannot apply what it shows is worse than
   * no button.
   */
  approvalId: string | null;
  /** Who may decide it. An empty list is a wait nobody can answer, and is said. */
  approvers: RecordChangeApprover[];
  /** The tool's own sentence saying what was NOT done. */
  notDone: string;
  change:
    | PendingFieldChange
    | PendingTableChange
    | PendingRecordsChange
    | PendingPatchChange
    | PendingDeleteChange;
}

/** The table a wait is about, when it is about an existing one. */
export function waitTableId(wait: RecordChangeWait): string | null {
  return wait.change.change === "table" ? null : wait.change.tableId;
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

/** The approvers the server resolved, as the card names people. */
function approversOf(raw: unknown): RecordChangeApprover[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      userId: asText(entry["user_id"]) ?? "",
      name: asText(entry["name"]),
      why: asText(entry["why"]),
    }))
    .filter((who) => who.userId.length > 0);
}

/** The rows a waiting write would create, carried whole — never summarised. */
function rowsOf(raw: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  return rows.length === raw.length ? rows : null;
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
  const approvalId = asText(body["approval_id"]);
  const approvers = approversOf(body["approvers"]);

  // RECORDS FIRST — it is the change an agent makes most often, and until
  // 2026-09-20 it was the one that never waited at all.
  const pendingRows = rowsOf(body["records"]);
  const tableId = asText(body["table_id"]);
  if (pendingRows && tableId) {
    return {
      action: action || "record_write",
      policy,
      approvalId,
      approvers,
      notDone,
      change: { change: "records", tableId, rows: pendingRows },
    };
  }

  // A PATCH — the record and the exact values. `record_propose` carries both
  // since 2026-09-26 (VERIFIER-26 item 5); an older answer without the patch
  // is not a decision anybody could be shown, so it is not drawn as one.
  const recordId = asText(body["record_id"]);
  const patch = asRecord(body["patch"]);
  if (recordId && tableId && patch && action !== "record_delete") {
    return {
      action: action || "record_write",
      policy,
      approvalId,
      approvers,
      notDone,
      change: { change: "patch", tableId, recordId, patch },
    };
  }

  if (recordId && tableId && action === "record_delete") {
    return {
      action,
      policy,
      approvalId,
      approvers,
      notDone,
      change: { change: "delete", tableId, recordId },
    };
  }

  const field = asRecord(body["field"]);
  if (field && tableId) {
    const key = asText(field["key"]);
    if (!key) return null;
    return {
      action: action || "field_propose",
      policy,
      approvalId,
      approvers,
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
      approvalId,
      approvers,
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

  if (wait.change.change === "records") {
    const rows = wait.change.rows;
    const table =
      options.tableName?.trim() || "the table the agent was asked about";
    // WHAT IS ACTUALLY BEING WRITTEN, not a count. A person approving twenty
    // rows into their own table is entitled to see the first one and the
    // columns they all touch; a bare "20 records" asks for a signature on
    // something nobody was shown.
    const columns = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    ).filter((key) => !key.startsWith("_"));
    const first = rows[0];
    const fields: ApprovalFieldDiff[] = [
      {
        label: rows.length === 1 ? "Record" : "Records",
        after: String(rows.length),
      },
      { label: "Table", after: table },
      {
        label: "Columns",
        after: columns.length ? columns.map(humanKey).join(", ") : "none named",
      },
      ...(first
        ? [
            {
              label: rows.length === 1 ? "Values" : "First of them",
              after: columns
                .map((key) => `${humanKey(key)}: ${String(first[key] ?? "")}`)
                .join(" · "),
            } satisfies ApprovalFieldDiff,
          ]
        : []),
    ];
    return {
      ...base,
      entity: "records",
      title: `${rows.length} ${rows.length === 1 ? "record" : "records"} in ${table}`,
      fields,
    };
  }

  if (wait.change.change === "patch") {
    const table =
      options.tableName?.trim() || "the table the agent was asked about";
    const patch = wait.change.patch;
    const keys = Object.keys(patch).filter((k) => !k.startsWith("_"));
    return {
      ...base,
      verb: "update",
      entity: "record",
      title: `A record in ${table}`,
      fields: [
        { label: "Table", after: table },
        ...keys.map(
          (key) =>
            ({
              label: humanKey(key),
              after: String(patch[key] ?? ""),
            }) satisfies ApprovalFieldDiff,
        ),
      ],
    };
  }

  if (wait.change.change === "delete") {
    const table =
      options.tableName?.trim() || "the table the agent was asked about";
    return {
      ...base,
      verb: "update",
      entity: "record",
      title: `Move a record in ${table} to the trash`,
      fields: [{ label: "Table", after: table }],
    };
  }

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
    wait.change.change === "patch"
      ? "The record was not changed."
      : wait.change.change === "delete"
        ? "The record was not moved to the trash."
        : wait.change.change === "field"
      ? `The column ${wait.change.label} was not added.`
      : wait.change.change === "records"
        ? `${wait.change.rows.length} ${
            wait.change.rows.length === 1 ? "record was" : "records were"
          } not written.`
        : `The table ${wait.change.name} was not created.`;
  return `${what} ${wait.policy.howToChange}`;
}

/**
 * WHAT THE CHIP SAYS about a held write — "Held for your approval: <what> on
 * <table>". VERIFIER-26 item 5: the chip used to read "The agent sent invalid
 * arguments" over a write the store had correctly held, which was false and
 * sent the person looking for a mistake nobody made.
 */
export function heldWriteHeadline(
  wait: RecordChangeWait,
  tableName?: string | null,
): string {
  const table = tableName?.trim() || null;
  const on = table ? ` on ${table}` : "";
  const c = wait.change;
  const what =
    c.change === "records"
      ? `${c.rows.length} new ${c.rows.length === 1 ? "record" : "records"}`
      : c.change === "patch"
        ? "a change to a record"
        : c.change === "delete"
          ? "moving a record to the trash"
          : c.change === "field"
            ? `the column ${c.label}`
            : `the new table ${c.name}`;
  return `Held for your approval: ${what}${c.change === "table" ? "" : on}`;
}

/**
 * A queue row (`custom.work_approval_read`) as the SAME wait a tool result
 * carries — so the table's own page draws the SAME card the chat draws, and a
 * person may decide from either. The row keeps the change, its subject and its
 * approvers; the policy sentences are the queue's, said once here.
 */
export function waitFromQueueRow(row: unknown): RecordChangeWait | null {
  const r = asRecord(row);
  if (!r) return null;
  if ((asText(r["state"]) ?? "pending") !== "pending") return null;
  const approvalId = asText(r["approval_id"]);
  const change = asRecord(r["change"]);
  const subjectId = asText(r["subject_id"]);
  if (!approvalId || !change || !subjectId) return null;
  const subjectKind = asText(r["subject_kind"]) ?? "record";
  const tableId =
    subjectKind === "table" ? subjectId : asText(r["subject_table_id"]);
  const kind = asText(change["kind"]);
  const policy: RecordChangeApprovalPolicy = {
    setting: "ask",
    why:
      asText(r["origin"]) === "agent"
        ? "An agent asked to change a table that already existed, and this organization asks a person first."
        : "Somebody asked for this change, and this organization asks a person first.",
    howToChange:
      "An owner or admin changes this in the organization's Settings, Configuration, under Agent changes to this organization's data.",
    reason: "queued",
  };
  const base = {
    action: kind ?? "",
    policy,
    approvalId,
    approvers: approversOf(r["approvers"]),
    notDone: "",
  };
  if (kind === "record_add" && tableId) {
    const rows = rowsOf(change["rows"]);
    if (!rows) return null;
    return { ...base, change: { change: "records", tableId, rows } };
  }
  if (kind === "record_patch" && tableId) {
    const patch = asRecord(change["patch"]);
    if (!patch) return null;
    return {
      ...base,
      change: { change: "patch", tableId, recordId: subjectId, patch },
    };
  }
  if (kind === "record_delete" && tableId) {
    return {
      ...base,
      change: { change: "delete", tableId, recordId: subjectId },
    };
  }
  if (kind === "field_add" && tableId) {
    const field = asRecord(change["field"]);
    const key = asText(field?.["key"]);
    if (!field || !key) return null;
    return {
      ...base,
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
  return null;
}
