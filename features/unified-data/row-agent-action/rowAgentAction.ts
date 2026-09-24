"use client";

/**
 * A TABLE'S AGENT BUTTON, PRESSED ON THE NEW TABLE PAGE — the host half of
 * `@ai-matrx/records-ui`'s `runAgentAction` port (TABLE-PARITY M3, lane GRID-TAILS).
 *
 * The default grid draws one button per `kind: "agent"` row action ("Draft follow-up") and,
 * when pressed, hands this file the table, the row, the action's name and its prompt. The
 * package ships no chat, so the conversation is started HERE, through the one agent seam the
 * older grid already used: the mandate `data.row_action` (Provision `data.table_row_action`,
 * declared in aidream `client_mandates.py`). Same job, same offer, same surface — so an agent
 * bound to that mandate answers the new page and the old one identically, and rebinding it
 * improves both with no deploy.
 *
 * 🚨 THE ROW TRAVELS AS THE JOB'S OFFER, never as user text (THE USER-INPUT LAW). The action's
 * prompt is the only human words in play and rides as the user input; the table, its columns,
 * the row exactly as the reader may see it and who is running it are offered values, and ride
 * as named context too so a Holder that declares none of them still sees them.
 *
 * 🚨 THE ROW IS READ THROUGH THE READ DOOR, AS THE PERSON. `recordRead` masks what this reader
 * may not see, so an agent is never handed a value the person pressing the button could not
 * read. `acting_person_can_edit` is the store's own answer (`myLevels`), never a guess.
 */

import { createRecordsClient } from "@ai-matrx/records/core";
import type { RecordsActor, RecordsDataSource } from "@ai-matrx/records";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { ManagedAgentOptions } from "@/features/agents/types/instance.types";
import type { DataTableRowActionOffer } from "@/types/python-generated/provision-offers";

/** What the package hands the host when an agent button is pressed. */
export interface RowAgentActionTarget {
  tableId: string;
  recordId: string;
  title: string;
  action: string;
  prompt: string;
}

/** One column of the offer, as `data.table_row_action` names it. */
interface OfferedColumn {
  display_name: string;
  field_name: string;
  data_type: string;
}

type Offer = Record<string, string | boolean | Record<string, unknown>>;

const WRITES = new Set(["editor", "admin"]);

/**
 * The offer `data.row_action` is supplied — the same keys `agentActionOffer` builds for the
 * older grid (`features/data-tables/row-actions.ts`), read here from the record store.
 * Pure, so it is tested without a database.
 */
export function rowAgentOffer(args: {
  target: RowAgentActionTarget;
  tableName: string;
  columns: ReadonlyArray<OfferedColumn & { sort?: number | null }>;
  document: Record<string, unknown>;
  actingPersonId: string | null;
  actingPersonCanEdit: boolean;
}): Offer {
  const ordered = args.columns
    .slice()
    .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER));
  // The row as the reader may see it: the store's own envelope keys (`_hidden`, `_sources`,
  // `_choices`, …) are provenance and notices, not columns, so they are not the row.
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args.document)) {
    if (!key.startsWith("_")) row[key] = value;
  }
  const summary = ordered
    .map((column) => {
      const v = row[column.field_name];
      const shown =
        v === null || v === undefined || v === ""
          ? "(empty)"
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
      return `${column.display_name}: ${shown}`;
    })
    .join("\n");
  const prompt = args.target.prompt.trim();
  // `satisfies` the Provision's generated shape: a renamed or newly guaranteed offered value
  // in aidream's `client_mandates.py` is a build failure here, not an agent quietly missing it.
  const offer = {
    table_id: args.target.tableId,
    table_name: args.tableName,
    table_columns: {
      columns: ordered.map(({ display_name, field_name, data_type }) => ({ display_name, field_name, data_type })),
    },
    row_id: args.target.recordId,
    row_label: args.target.title || args.target.recordId,
    row_json: row,
    row_fields_summary: summary,
    action_name: args.target.action,
    // Optional values are omitted when blank — a blank is missing, not an answer.
    ...(prompt ? { action_prompt: prompt } : {}),
    ...(args.actingPersonId ? { acting_person_id: args.actingPersonId } : {}),
    acting_person_can_edit: args.actingPersonCanEdit,
  } satisfies DataTableRowActionOffer;
  return offer;
}

/** The launch the older grid makes, for this row — `data.row_action` in the flexible panel. */
export function rowAgentLaunch(target: RowAgentActionTarget, offer: Offer): ManagedAgentOptions {
  return {
    surfaceKey: `data-v2-row-action:${target.tableId}:${target.recordId}`,
    sourceFeature: "chat",
    config: {
      displayMode: "flexible-panel",
      autoRun: true,
      allowChat: true,
      showPreExecutionGate: false,
    },
    runtime: {
      userInput: target.prompt.trim() || target.action,
      variables: offer,
      context: offer,
      surfaceName: "matrx-user/data-tables",
    },
  };
}

/**
 * Read what the offer needs through the person's own records client, then launch.
 * Every refusal is said, in the store's words, through `onRefused` — a button that did
 * nothing when pressed is the failure this whole port exists to avoid.
 */
export async function runRowAgentAction(args: {
  target: RowAgentActionTarget;
  dataSource: RecordsDataSource;
  actor: RecordsActor;
  organizationId: string;
  actingPersonId: string | null;
  launchMandate: (key: typeof MANDATE_KEYS.data__row_action, options: ManagedAgentOptions) => Promise<unknown>;
  onRefused: (title: string, why: string) => void;
}): Promise<void> {
  const { target } = args;
  const client = createRecordsClient({
    dataSource: args.dataSource,
    actor: args.actor,
    organizationId: args.organizationId,
  });
  const [tables, fields, record, levels] = await Promise.all([
    client.tableList(),
    client.fields({ table_id: target.tableId }),
    client.recordRead({ record_id: target.recordId }),
    client.myLevels({ ids: [target.recordId] }),
  ]);
  const refusal = [tables, fields, record].find((answer) => !answer.ok);
  if (refusal && !refusal.ok) {
    args.onRefused(`Could not start "${target.action}"`, refusal.error.message);
    return;
  }
  if (!tables.ok || !fields.ok || !record.ok) return;
  const table = tables.data.find((t) => t.id === target.tableId);
  const level = levels.ok ? (levels.data.find((l) => l.id === target.recordId)?.level ?? null) : null;
  const offer = rowAgentOffer({
    target,
    tableName: table?.name ?? "this table",
    columns: fields.data.map((f) => ({
      display_name: f.label,
      field_name: f.key,
      data_type: f.type,
      sort: f.sort,
    })),
    document: (record.data.document ?? {}) as Record<string, unknown>,
    actingPersonId: args.actingPersonId,
    actingPersonCanEdit: level !== null && WRITES.has(level),
  });
  try {
    await args.launchMandate(MANDATE_KEYS.data__row_action, rowAgentLaunch(target, offer));
  } catch (e) {
    args.onRefused(
      `Could not start "${target.action}"`,
      e instanceof Error ? e.message : "The agent could not be started.",
    );
  }
}
