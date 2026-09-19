/**
 * applyListChange — THE PORT. One module, one function per verb, one
 * implementation per kind of list.
 *
 * An agent proposes changes to a list (`list_change_proposal_v1`); a person
 * accepts or rejects each one in the message; the accepted ones have to land
 * in whatever actually holds that list. This module is the ONLY place that
 * knows what "that list" means, so the day the record store changes, the kind,
 * the component, the skill the agents were taught and every conversation
 * already on the screen are all untouched.
 *
 * TWO IMPLEMENTATIONS, ONE SHAPE:
 *   - `scope_dataset` (today) — a context item bound to a table template,
 *     provisioned once per scope by `context.provision_scope_dataset`, rows in
 *     `workbench.udt_dataset_rows`. Writes go through the dataset service's
 *     `udt_bulk_write` door under the person's own authority; the store's own
 *     refusal is carried back verbatim, never translated into a shrug.
 *   - `table` (live) — a Table homed in a Record in the unified record store
 *     (`custom.record`, the client doors `record_write` / `record_update` /
 *     `record_delete` / `read_records`; v5 CONTRACT AGT-4 / AGT-8), reached
 *     through `@ai-matrx/records/core`'s `createRecordsClient`. The store's
 *     own refusal is carried back verbatim here too, never translated.
 *
 * NOTHING HERE TOUCHES A DECISION. Applying is one thing; remembering what the
 * person decided is another (`decisions.ts`). Keeping them apart is what makes
 * "accept" survive a reload for everyone rather than for one browser: an
 * accepted add is visible because THE ROW IS THERE, read back from the store,
 * not because a flag says so.
 */

import {
  bulkWrite,
  getCompleteTable,
  type CompleteTableField,
} from "@/features/data-tables/service";
import type { BulkOp } from "@/features/data-tables/types";
import { isBulkOpError } from "@/features/data-tables/types";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  UNIFIED_DATA_CAMPAIGN,
  UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
} from "@/lib/knobs/unifiedDataCampaign";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

import type {
  ListChangeProposalItem,
  ListChangeTarget,
} from "@/features/content-ir/kinds/list-change-proposal";

// ---------------------------------------------------------------------------
// The outcomes — three, and every one of them says something true.
// ---------------------------------------------------------------------------

export type ApplyOutcome =
  /** The store changed. `rowId` is the row it changed, when there is one. */
  | { status: "applied"; detail: string; rowId: string | null }
  /** The store was ALREADY in the proposed state. A no-op, and an honest one. */
  | { status: "already"; detail: string }
  /** The store said no. `detail` is the store's own words, never a paraphrase. */
  | { status: "refused"; detail: string };

/** One row of whatever list the target names, in the shape the UI compares on. */
export interface ListRow {
  id: string;
  values: Record<string, unknown>;
}

export interface ListSnapshot {
  /** The list's columns in their declared order. */
  fields: { name: string; label: string }[];
  rows: ListRow[];
  /** What to call this list on screen when the payload named nothing. */
  label: string;
}

export type ReadOutcome =
  | { status: "read"; snapshot: ListSnapshot }
  | { status: "refused"; detail: string };

// ---------------------------------------------------------------------------
// The registry — one entry per kind of list. Adding a store adds an entry.
// ---------------------------------------------------------------------------

interface ListStore<T extends ListChangeTarget> {
  read(target: T): Promise<ReadOutcome>;
  apply(target: T, proposal: ListChangeProposalItem): Promise<ApplyOutcome>;
}

// ── implementation 1: a scope's copy of a template-backed table ─────────────

/**
 * The dataset id behind a (context item, scope) pair. `provision_scope_dataset`
 * is idempotent — it returns the existing instance or creates the scope's copy
 * on first ask — so this is safe to call on every read.
 */
async function resolveScopeDataset(
  target: Extract<ListChangeTarget, { kind: "scope_dataset" }>,
): Promise<{ datasetId: string } | { refused: string }> {
  const res = await scopesService.provisionScopeDataset(
    target.contextItemId,
    target.scopeId,
  );
  if (isScopesRpcErr(res)) return { refused: res.error.message };
  return { datasetId: res.data.datasetId };
}

function fieldLabels(fields: CompleteTableField[]): { name: string; label: string }[] {
  return fields.map((f) => ({ name: f.field_name, label: f.display_name }));
}

const scopeDatasetStore: ListStore<
  Extract<ListChangeTarget, { kind: "scope_dataset" }>
> = {
  async read(target) {
    const resolved = await resolveScopeDataset(target);
    if ("refused" in resolved) return { status: "refused", detail: resolved.refused };

    const table = await getCompleteTable({ tableId: resolved.datasetId });
    if (!table.success) return { status: "refused", detail: table.error };

    const storedName =
      typeof table.data.table.table_name === "string"
        ? table.data.table.table_name
        : "";
    return {
      status: "read",
      snapshot: {
        fields: fieldLabels(table.data.fields),
        rows: table.data.rows.map((r) => ({ id: r.id, values: r.data })),
        label: target.label ?? storedName ?? "this list",
      },
    };
  },

  async apply(target, proposal) {
    const resolved = await resolveScopeDataset(target);
    if ("refused" in resolved) return { status: "refused", detail: resolved.refused };
    const tableId = resolved.datasetId;

    const op: BulkOp =
      proposal.action === "add"
        ? { op: "insert", data: proposal.values }
        : proposal.action === "remove"
          ? { op: "delete", row_id: proposal.rowId }
          : { op: "merge", row_id: proposal.rowId, data: proposal.patch };

    const res = await bulkWrite({ tableId, operations: [op] });
    if (!res.success) return { status: "refused", detail: res.error };

    const slot = res.data.results[0];
    if (slot === undefined) {
      return {
        status: "refused",
        detail: "The table accepted the request but reported no result for it.",
      };
    }
    if (isBulkOpError(slot)) {
      // `udt_bulk_write` soft-fails a miss rather than raising. A row that is
      // not there can only mean the change already happened (or someone else
      // made it), which is a no-op, not a failure.
      return {
        status: "already",
        detail:
          proposal.action === "remove"
            ? "That row is already off the list."
            : "That row is no longer on the list, so there was nothing to change.",
      };
    }
    return {
      status: "applied",
      rowId: slot.id,
      detail:
        proposal.action === "add"
          ? "Added to the list."
          : proposal.action === "remove"
            ? "Removed from the list."
            : "Updated on the list.",
    };
  },
};

// ── implementation 2: a Table homed in a Record (the unified record store) ──

/**
 * The store is live: `custom.record_write` / `custom.record_update` /
 * `custom.record_delete` / `custom.read_records` behind the client doors
 * (v5 CONTRACT AGT-4 / AGT-8), reached through `@ai-matrx/records/core`. There
 * is no "current organization" this module resolves for itself — it reads the
 * same redux slice a component would, via the store singleton, because this
 * file is a plain module and not a hook.
 */
/**
 * The switch, resolved the way a person actually sees it: their own override
 * beats their organization, which beats the platform default
 * (`useUnifiedDataCampaign`'s ladder) — never just the platform row, or an
 * admin who was switched on personally would still be refused here.
 */
async function unifiedDataCampaignOn(
  organizationId: string | null,
  userId: string | null,
): Promise<boolean> {
  if (!organizationId) return UNIFIED_DATA_CAMPAIGN.enabled();
  const resolved = await ensureEffectiveKnob(organizationId, userId, {
    feature: UNIFIED_DATA_CAMPAIGN.FEATURE,
    key: UNIFIED_DATA_CAMPAIGN.KEY,
  });
  return resolved === true || resolved === "true";
}

async function recordsClientOrRefusal(): Promise<{ client: RecordsClient } | { refused: string }> {
  const state = getStoreSingleton()?.getState();
  const organizationId = state ? selectActiveOrganizationId(state) : null;
  const userId = state ? selectUserId(state) : null;
  if (!(await unifiedDataCampaignOn(organizationId, userId))) {
    return { refused: UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE };
  }
  if (!organizationId) {
    return {
      refused: "No organization is active, so the record store cannot be reached.",
    };
  }
  return {
    client: createRecordsClient({
      dataSource: recordsDataSource(createClient()),
      actor: personActor(userId),
      organizationId,
    }),
  };
}

const recordTableStore: ListStore<Extract<ListChangeTarget, { kind: "table" }>> = {
  async read(target) {
    const resolved = await recordsClientOrRefusal();
    if ("refused" in resolved) return { status: "refused", detail: resolved.refused };
    const { client } = resolved;

    const [fields, page] = await Promise.all([
      client.fields({ table_id: target.tableId }),
      client.list({ table_id: target.tableId }),
    ]);
    if (!fields.ok) return { status: "refused", detail: fields.error.message };
    if (!page.ok) return { status: "refused", detail: page.error.message };

    return {
      status: "read",
      snapshot: {
        fields: fields.data.map((f) => ({ name: f.key, label: f.label })),
        rows: page.data.rows.map((r) => ({ id: r.id, values: r.document })),
        label: target.label ?? "this list",
      },
    };
  },

  async apply(target, proposal) {
    const resolved = await recordsClientOrRefusal();
    if ("refused" in resolved) return { status: "refused", detail: resolved.refused };
    const { client } = resolved;

    if (proposal.action === "add") {
      const written = await client.recordWrite({ table_id: target.tableId, data: proposal.values });
      if (!written.ok) return { status: "refused", detail: written.error.message };
      return { status: "applied", rowId: written.data, detail: "Added to the list." };
    }
    if (proposal.action === "remove") {
      const deleted = await client.recordDelete({ record_id: proposal.rowId });
      if (!deleted.ok) return { status: "refused", detail: deleted.error.message };
      return { status: "applied", rowId: proposal.rowId, detail: "Removed from the list." };
    }
    const updated = await client.recordUpdate({ record_id: proposal.rowId, patch: proposal.patch });
    if (!updated.ok) return { status: "refused", detail: updated.error.message };
    return { status: "applied", rowId: proposal.rowId, detail: "Updated on the list." };
  },
};

// ---------------------------------------------------------------------------
// The two doors every caller uses.
// ---------------------------------------------------------------------------

/** Read the list a target names, so proposals can be shown against reality. */
export async function readListTarget(target: ListChangeTarget): Promise<ReadOutcome> {
  if (target.kind === "scope_dataset") return scopeDatasetStore.read(target);
  return recordTableStore.read(target);
}

/** Apply ONE proposal, under the caller's own authority. */
export async function applyListChange(
  target: ListChangeTarget,
  proposal: ListChangeProposalItem,
): Promise<ApplyOutcome> {
  if (target.kind === "scope_dataset") return scopeDatasetStore.apply(target, proposal);
  return recordTableStore.apply(target, proposal);
}

// ---------------------------------------------------------------------------
// Standing — what the store says about a proposal RIGHT NOW.
// ---------------------------------------------------------------------------

export type ProposalStanding =
  /** The store is not yet in the proposed state. */
  | "open"
  /** The store is already in the proposed state — accepting would change nothing. */
  | "settled";

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : JSON.stringify(value ?? null);
}

/**
 * Does the list already say what this proposal proposes?
 *
 * The rule is deliberately one rule for every list, because the primitive
 * knows nothing about columns: a `remove` or `update` is settled when its row
 * is gone; an `add` is settled when some row already carries the same value in
 * the list's FIRST column — the column a list puts its name in. Anything
 * subtler would be this module guessing at a customer's schema.
 */
export function proposalStanding(
  snapshot: ListSnapshot,
  proposal: ListChangeProposalItem,
): ProposalStanding {
  if (proposal.action === "remove") {
    return snapshot.rows.some((r) => r.id === proposal.rowId) ? "open" : "settled";
  }
  if (proposal.action === "update") {
    const row = snapshot.rows.find((r) => r.id === proposal.rowId);
    if (!row) return "settled";
    const alreadyMatches = Object.entries(proposal.patch).every(
      ([key, value]) => normalize(row.values[key]) === normalize(value),
    );
    return alreadyMatches ? "settled" : "open";
  }
  const keyField = snapshot.fields[0]?.name;
  if (!keyField) return "open";
  const proposed = proposal.values[keyField];
  if (proposed === undefined) return "open";
  return snapshot.rows.some((r) => normalize(r.values[keyField]) === normalize(proposed))
    ? "settled"
    : "open";
}
