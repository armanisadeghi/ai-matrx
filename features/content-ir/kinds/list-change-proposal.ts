/**
 * list_change_proposal_v1 — THE PLATFORM PRIMITIVE for "an agent proposes
 * changes to a list, and the person accepts or rejects them in the message."
 *
 * Any agent, any list, any scope. The first customer is a repository's known
 * defects ("so things that are already known don't get harped on every time
 * you have a new agent"), but nothing here knows what a defect is: the kind
 * carries a LIST TARGET and a flat array of proposed row changes, and the
 * apply port (`features/list-change-proposals/applyListChange.ts`) decides
 * what the target means.
 *
 * NAME. The repo's convention for a proposal kind is `<thing>_v1` singular
 * holding an array (`map_topic_proposal_v1` holds `topics`), so the envelope
 * is `list_change_proposal_v1`, not a plural. "Proposal" is the word the
 * platform already ships for an AI change awaiting a person
 * (`map_topic_proposal_v1`, `schema_proposal`, CONTRACT AGT-8); the
 * vocabulary's "Suggestion" is taken — it means specifically an AI guess that
 * a Source belongs to a Scope. GitHub calls the same interaction a suggested
 * change, Google Docs a suggestion, and both put Accept and Reject on each
 * one individually plus an accept-all; that is what the component does.
 *
 * 🚨 THREE FLAT KINDS, NO RECURSION AND NO UNIONS. A self-referencing or
 * `anyOf`-rooted JSON schema is refused outright by Anthropic's structured
 * output gate and by Gemini's restricted subset — a kind no model can be
 * bound to is not a kind. So:
 *   - `list_change_target_v1` is ONE object with a `kind` discriminator and
 *     every address field nullable. The discriminated union lives in
 *     TypeScript (`ListChangeTarget`), narrowed by `kind`, never in the
 *     schema.
 *   - `list_change_proposal_item_v1` is ONE object with an `action`
 *     discriminator (`add` | `remove` | `update`) and the per-action fields
 *     nullable (`values` for add, `row_id` for remove/update, `patch` for
 *     update).
 *
 * THE TARGET SURVIVES THE STORE CHANGEOVER. `kind:"scope_dataset"` addresses
 * today's live path (a context item bound to a dataset template, provisioned
 * once per scope — `context.provision_scope_dataset`, rows in
 * `workbench.udt_dataset_rows`). `kind:"table"` addresses the unified record
 * store's Table-homed-in-a-Record (v5 CONTRACT AGT-4/AGT-8, `record_write` /
 * `record_delete` behind one door) and is implemented as an honest refusal
 * naming the store by name until it lands. Swapping the target does not
 * change this kind, the component, or anything an agent was taught.
 *
 * Complete-only bridge: accept / reject on a half-parsed list would apply a
 * row the model had not finished writing, so the bridge declines every
 * streaming envelope and the dispatch entry's loader stands while it streams.
 * The value reaches the component VERBATIM — markers included, at every depth
 * (KINDS_EVERYWHERE §4.2).
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

export const LIST_CHANGE_PROPOSAL_KIND = "list_change_proposal_v1";
export const LIST_CHANGE_PROPOSAL_ITEM_KIND = "list_change_proposal_item_v1";
export const LIST_CHANGE_TARGET_KIND = "list_change_target_v1";
/** The render key `kind-route` sets `block.type` to (SHAPE_BLOCK_DISPATCH). */
export const LIST_CHANGE_PROPOSAL_BLOCK_TYPE = "list_change_proposal";

/** Every list target the port knows how to address. */
export const LIST_TARGET_KINDS = ["scope_dataset", "table"] as const;
export type ListTargetKind = (typeof LIST_TARGET_KINDS)[number];

export const LIST_CHANGE_ACTIONS = ["add", "remove", "update"] as const;
export type ListChangeAction = (typeof LIST_CHANGE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Schemas — the compiled floor; the live `kind_definition` rows win once warm.
// ---------------------------------------------------------------------------

export const listChangeTargetKindSchema: KindSchema = {
  kind: LIST_CHANGE_TARGET_KIND,
  fields: {
    kind: {
      type: "enum",
      values: [...LIST_TARGET_KINDS],
      required: true,
      description:
        "Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store.",
    },
    context_item_id: {
      type: "string",
      nullable: true,
      description: "scope_dataset only: the context item that holds the list.",
    },
    scope_id: {
      type: "string",
      nullable: true,
      description: "scope_dataset only: the scope whose copy of the list this is.",
    },
    table_id: {
      type: "string",
      nullable: true,
      description: "table only: the Table being changed.",
    },
    home_record_id: {
      type: "string",
      nullable: true,
      description: "table only: the Record the Table is homed in.",
    },
    label: {
      type: "string",
      nullable: true,
      description:
        "What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const listChangeProposalItemKindSchema: KindSchema = {
  kind: LIST_CHANGE_PROPOSAL_ITEM_KIND,
  fields: {
    id: {
      type: "string",
      required: true,
      description:
        "A short id unique within this message, so a decision can be remembered against it. Never reuse one.",
    },
    action: {
      type: "enum",
      values: [...LIST_CHANGE_ACTIONS],
      required: true,
      description: "add a new row, remove an existing one, or update one in place.",
    },
    title: {
      type: "string",
      required: true,
      description:
        "One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list.",
    },
    reason: {
      type: "string",
      required: true,
      description: "One sentence on why. Not a paragraph, not a restatement of the row.",
    },
    values: {
      type: "inline_object",
      open: true,
      fields: {},
      nullable: true,
      description:
        "add only: the new row's values, keyed by the list's own column names.",
    },
    row_id: {
      type: "string",
      nullable: true,
      description: "remove and update only: the id of the row already in the list.",
    },
    patch: {
      type: "inline_object",
      open: true,
      fields: {},
      nullable: true,
      description:
        "update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const listChangeProposalKindSchema: KindSchema = {
  kind: LIST_CHANGE_PROPOSAL_KIND,
  fields: {
    target: {
      type: "object",
      kind: LIST_CHANGE_TARGET_KIND,
      required: true,
      description: "Which list these changes are for.",
    },
    summary: {
      type: "string",
      required: true,
      description:
        "One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself.",
    },
    proposals: {
      type: "array",
      itemKinds: [LIST_CHANGE_PROPOSAL_ITEM_KIND],
      required: true,
      description:
        "The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

// ---------------------------------------------------------------------------
// The typed value — the discriminated unions the schema cannot carry.
// ---------------------------------------------------------------------------

export type ListChangeTarget =
  | {
      kind: "scope_dataset";
      contextItemId: string;
      scopeId: string;
      label: string | null;
    }
  | {
      kind: "table";
      tableId: string;
      homeRecordId: string | null;
      label: string | null;
    };

export type ListChangeProposalItem =
  | {
      id: string;
      action: "add";
      title: string;
      reason: string;
      values: Record<string, unknown>;
    }
  | {
      id: string;
      action: "remove";
      title: string;
      reason: string;
      rowId: string;
    }
  | {
      id: string;
      action: "update";
      title: string;
      reason: string;
      rowId: string;
      patch: Record<string, unknown>;
    };

export interface ListChangeProposalValue {
  target: ListChangeTarget;
  summary: string;
  proposals: ListChangeProposalItem[];
  /** Proposals the reader REFUSED, with the reason — never silently dropped. */
  unreadable: { index: number; why: string }[];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/**
 * Narrow the raw target onto the union. Returns null (with no partial target)
 * when the address for the declared kind is incomplete — a control that would
 * write to nowhere is worse than an honest notice.
 */
export function readListChangeTarget(raw: unknown): ListChangeTarget | null {
  const value = obj(raw);
  if (!value) return null;
  const label = str(value.label);
  if (value.kind === "scope_dataset") {
    const contextItemId = str(value.context_item_id);
    const scopeId = str(value.scope_id);
    if (!contextItemId || !scopeId) return null;
    return { kind: "scope_dataset", contextItemId, scopeId, label };
  }
  if (value.kind === "table") {
    const tableId = str(value.table_id);
    if (!tableId) return null;
    return { kind: "table", tableId, homeRecordId: str(value.home_record_id), label };
  }
  return null;
}

/** Why one raw proposal could not be read — shown, never swallowed. */
function readProposalItem(
  raw: unknown,
): { ok: ListChangeProposalItem } | { why: string } {
  const value = obj(raw);
  if (!value) return { why: "it is not an object" };
  const id = str(value.id);
  const title = str(value.title);
  const reason = str(value.reason);
  if (!id) return { why: "it carries no id" };
  if (!title) return { why: `proposal ${id} carries no title` };
  if (!reason) return { why: `proposal ${id} carries no reason` };

  if (value.action === "add") {
    const values = obj(value.values);
    if (!values || Object.keys(values).length === 0) {
      return { why: `proposal ${id} adds a row but carries no values` };
    }
    return { ok: { id, action: "add", title, reason, values } };
  }
  if (value.action === "remove") {
    const rowId = str(value.row_id);
    if (!rowId) return { why: `proposal ${id} removes a row but names no row id` };
    return { ok: { id, action: "remove", title, reason, rowId } };
  }
  if (value.action === "update") {
    const rowId = str(value.row_id);
    const patch = obj(value.patch);
    if (!rowId) return { why: `proposal ${id} updates a row but names no row id` };
    if (!patch || Object.keys(patch).length === 0) {
      return { why: `proposal ${id} updates a row but carries an empty patch` };
    }
    return { ok: { id, action: "update", title, reason, rowId, patch } };
  }
  return { why: `proposal ${id} names an action we do not know: ${String(value.action)}` };
}

/**
 * The ONE reader. The chat bridge and any host that renders a proposal set
 * directly both come through here, so there is never a second interpretation
 * of the same payload.
 */
export function readListChangeProposal(raw: unknown): ListChangeProposalValue | null {
  const value = obj(raw);
  if (!value) return null;
  const target = readListChangeTarget(value.target);
  if (!target) return null;
  if (!Array.isArray(value.proposals)) return null;

  const proposals: ListChangeProposalItem[] = [];
  const unreadable: { index: number; why: string }[] = [];
  value.proposals.forEach((item, index) => {
    const read = readProposalItem(item);
    if ("ok" in read) proposals.push(read.ok);
    else unreadable.push({ index, why: read.why });
  });

  return {
    target,
    summary: str(value.summary) ?? "",
    proposals,
    unreadable,
  };
}

// ---------------------------------------------------------------------------
// serverData bridge — the value verbatim.
// ---------------------------------------------------------------------------

/** What `ListChangeProposalBlock` receives. `proposal` is the payload, untouched. */
export interface ListChangeProposalServerData extends Record<string, unknown> {
  proposal: Record<string, unknown>;
}

export const listChangeProposalServerDataFromEnvelope = makeCompleteEnvelopeBridge<
  ListChangeProposalServerData
>(LIST_CHANGE_PROPOSAL_KIND, (value) => {
  // The one thing the component cannot do without: a proposals array. Its
  // EMPTINESS is a real answer ("nothing on this list should change"), so
  // only its absence declines.
  if (!Array.isArray(value.proposals)) return undefined;
  return { proposal: value };
});

// ---------------------------------------------------------------------------
// toMarkdown facet — one line per proposal, decisions absent by design.
// ---------------------------------------------------------------------------

const MD_ROOT_KNOWN_KEYS = ["target", "summary", "proposals", KIND_KEY];
const MD_ITEM_KNOWN_KEYS = [
  "id",
  "action",
  "title",
  "reason",
  "values",
  "row_id",
  "patch",
  KIND_KEY,
];

const ACTION_WORD: Record<string, string> = {
  add: "Add",
  remove: "Remove",
  update: "Update",
};

export function listChangeProposalMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const read = readListChangeProposal(value);
  const heading = read?.target.label
    ? `# Proposed changes — ${read.target.label}`
    : "# Proposed changes to the list";
  const lines = (read?.proposals ?? []).map(
    (p) => `- **${ACTION_WORD[p.action] ?? p.action}:** ${p.title} — ${p.reason}`,
  );
  const refused = (read?.unreadable ?? []).map(
    (u) => `- Proposal ${u.index + 1} could not be read: ${u.why}`,
  );
  return joinBlocks([
    heading,
    read?.summary || null,
    lines.length > 0 ? lines.join("\n") : "_No changes were proposed._",
    refused.length > 0 ? `## Not readable\n\n${refused.join("\n")}` : null,
    additionalDetailsSection(collectExtras(value, MD_ROOT_KNOWN_KEYS)),
  ]);
}

export function listChangeProposalItemMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const action = typeof value.action === "string" ? value.action : "";
  const title = typeof value.title === "string" ? value.title : "(untitled)";
  const reason = typeof value.reason === "string" ? value.reason : "";
  return joinBlocks([
    `**${ACTION_WORD[action] ?? action}:** ${title}${reason ? ` — ${reason}` : ""}`,
    additionalDetailsSection(collectExtras(value, MD_ITEM_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const LIST_CHANGE_PROPOSAL_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: LIST_CHANGE_PROPOSAL_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: LIST_CHANGE_PROPOSAL_BLOCK_TYPE,
    toLegacyServerData: listChangeProposalServerDataFromEnvelope,
    toMarkdown: listChangeProposalMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: listChangeProposalKindSchema,
  },
  {
    kind: LIST_CHANGE_PROPOSAL_ITEM_KIND,
    schemaSource: "system",
    tier: "eager",
    toMarkdown: listChangeProposalItemMarkdownFromValue,
    schema: listChangeProposalItemKindSchema,
  },
  {
    kind: LIST_CHANGE_TARGET_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: listChangeTargetKindSchema,
  },
];
