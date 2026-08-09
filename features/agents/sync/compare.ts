/**
 * Linked-agent sync comparison — the pure core.
 *
 * Answers the only question the Linked Agent Sync panel exists to answer:
 * *are these two agents the same, and if not, how?* A timestamp is not an
 * answer.
 *
 * The comparison is scoped to `AGENT_SYNC_FIELDS` — exactly the columns
 * `agx_sync_linked_agents` copies — so the verdict can never disagree with what
 * Pull/Push would actually overwrite.
 *
 * No React, no Redux, no network: feed it two snapshots, get a verdict. That is
 * what makes it unit-testable against real production rows.
 */

import { computeDiff } from "@/components/diff/engine/compute-diff";
import type { ChangeType, DiffNode } from "@/components/diff/engine/types";
import {
  AGENT_SYNC_FIELDS,
  AGENT_SYNC_FIELD_BY_KEY,
  type AgentSyncFieldGroup,
  type AgentSyncSnapshot,
} from "./sync-fields";

/**
 * `identical` — every synced field is byte-equal.
 * `differs`   — at least one synced field differs.
 * `unknown`   — one or both sides could not be read (RLS, deleted, not loaded).
 *               Never downgrade this to `identical`: "I couldn't look" and
 *               "they match" are different answers.
 */
export type AgentSyncVerdict = "identical" | "differs" | "unknown";

export type AgentSyncSide = "user" | "system";

export interface AgentSyncFieldChange {
  /** camelCase key (also the diff adapter registry key). */
  field: string;
  /** `agent.definition` column the sync writes. */
  column: string;
  label: string;
  group: AgentSyncFieldGroup;
  changeType: ChangeType;
  /**
   * True when the ONLY difference is item order (or duplicate count) inside an
   * array — the values are the same set. Still a real write, so it still counts
   * as a difference; it just deserves a gentler line in the summary.
   */
  orderOnly: boolean;
  /** Changed leaf entries beneath this field. 1 for a scalar. */
  changedCount: number;
}

export interface AgentSyncComparison {
  verdict: AgentSyncVerdict;
  /** Sides that could not be read. Non-empty exactly when verdict is `unknown`. */
  unreadable: AgentSyncSide[];
  /** All differing fields, identity first (declaration order). */
  changed: AgentSyncFieldChange[];
  identityChanged: AgentSyncFieldChange[];
  behaviorChanged: AgentSyncFieldChange[];
  /** How many fields the sync governs in total — the denominator for "N of M". */
  comparedFieldCount: number;
}

/**
 * The diff options for the VERDICT — deliberately EMPTY of every ergonomic
 * option `AGENT_DIFF_OPTIONS` carries.
 *
 * The rule is one sentence: **the RPC copies these columns verbatim, so any
 * option that makes two different stored values look equal is a lie here.**
 * The viewer may soften a diff for readability; a verdict that gates a
 * destructive button may not.
 *
 *  - no `excludePaths` — that set is keyed by bare key name at EVERY depth, so
 *    it would also drop a nested `version`/`id` key inside `settings` or a
 *    message.
 *  - `skipUnderscorePrefix: false` — the RPC copies `_`-prefixed keys (e.g. a
 *    `__kind` envelope inside a message) verbatim.
 *  - **no `identityKeys`.** Matching array items by `name`/`key` instead of by
 *    position is exactly the "make different values look equal" move: it
 *    reported a reordered `variable_definitions` as IDENTICAL (a different
 *    jsonb value the sync would write), it silently DROPPED items whose
 *    identity key collided (two `context_slots` with the same `key` compared
 *    equal to one), and because the engine keys it off the last path segment
 *    it leaked to any nested array that merely happened to be spelled
 *    `variableDefinitions`. Positional comparison is the only one faithful to
 *    an `UPDATE ... SET col = v_from.col`.
 *
 * `AGENT_IDENTITY_KEYS` still belongs to `AgentDiffViewer`, which answers a
 * different question ("show me what a human would call a change").
 */
const SYNC_VERDICT_DIFF_OPTIONS = {
  skipUnderscorePrefix: false,
} as const;

/** Changed leaves beneath a node (the node itself when it has no children). */
function countChangedLeaves(node: DiffNode): number {
  const changedChildren = (node.children ?? []).filter(
    (c) => c.changeType !== "unchanged",
  );
  if (changedChildren.length === 0) return 1;
  return changedChildren.reduce((sum, c) => sum + countChangedLeaves(c), 0);
}

/**
 * True when every changed leaf beneath this node is a pure reorder.
 *
 * The engine's array scan is SET-based, so it reports `reordered` whenever the
 * two arrays hold the same distinct values — including at different
 * MULTIPLICITIES. `["a","b"]` vs `["a","b","b"]` differs in length, but
 * `["a","a","b"]` vs `["a","b","b"]` does not, so a length check is not enough:
 * that pair is a genuine content change wearing a reorder's clothes. Comparing
 * the multisets is what actually keeps the gentler "order only" label honest.
 *
 * Note this can only ever be true for arrays of PRIMITIVES (tools, tags,
 * mcp_servers). The verdict matches arrays of objects positionally, so a
 * reordered `variable_definitions` surfaces as modified leaves, not `reordered`.
 */
function isOrderOnly(node: DiffNode): boolean {
  if (node.changeType === "reordered") {
    const before = node.oldValue;
    const after = node.newValue;
    if (Array.isArray(before) && Array.isArray(after)) {
      if (before.length !== after.length) return false;
      const sortedKeys = (arr: unknown[]) =>
        arr.map((v) => JSON.stringify(v) ?? "undefined").sort();
      const a = sortedKeys(before);
      const b = sortedKeys(after);
      return a.every((key, i) => key === b[i]);
    }
    return true;
  }
  const changedChildren = (node.children ?? []).filter(
    (c) => c.changeType !== "unchanged",
  );
  if (changedChildren.length === 0) return false;
  return changedChildren.every(isOrderOnly);
}

function toFieldChange(node: DiffNode): AgentSyncFieldChange | null {
  const descriptor = AGENT_SYNC_FIELD_BY_KEY[node.key];
  // A key outside the sync field set cannot be reported as a sync difference —
  // the sync would not write it.
  if (!descriptor) return null;
  return {
    field: descriptor.field,
    column: descriptor.column,
    label: descriptor.label,
    group: descriptor.group,
    changeType: node.changeType,
    orderOnly: isOrderOnly(node),
    changedCount: countChangedLeaves(node),
  };
}

/**
 * Compare the two sides of a linked pair.
 *
 * Pass `null` for a side that could not be read — that yields `unknown`, which
 * every caller must render as "couldn't check", never as a clean bill of health.
 */
export function compareAgentSyncSnapshots(
  userSnapshot: AgentSyncSnapshot | null,
  systemSnapshot: AgentSyncSnapshot | null,
): AgentSyncComparison {
  const unreadable: AgentSyncSide[] = [];
  if (!userSnapshot) unreadable.push("user");
  if (!systemSnapshot) unreadable.push("system");

  const comparedFieldCount = AGENT_SYNC_FIELDS.length;

  if (unreadable.length > 0) {
    return {
      verdict: "unknown",
      unreadable,
      changed: [],
      identityChanged: [],
      behaviorChanged: [],
      comparedFieldCount,
    };
  }

  const diff = computeDiff(
    userSnapshot as Record<string, unknown>,
    systemSnapshot as Record<string, unknown>,
    SYNC_VERDICT_DIFF_OPTIONS,
  );

  const byField = new Map<string, AgentSyncFieldChange>();
  for (const node of diff.root) {
    if (node.changeType === "unchanged") continue;
    const change = toFieldChange(node);
    if (change) byField.set(change.field, change);
  }

  // Declaration order, so the summary reads the same every time.
  const changed = AGENT_SYNC_FIELDS.map((f) => byField.get(f.field)).filter(
    (c): c is AgentSyncFieldChange => c !== undefined,
  );

  return {
    verdict: changed.length === 0 ? "identical" : "differs",
    unreadable,
    changed,
    identityChanged: changed.filter((c) => c.group === "identity"),
    behaviorChanged: changed.filter((c) => c.group === "behavior"),
    comparedFieldCount,
  };
}

export interface AgentSyncImpact {
  /** Fields this specific sync would overwrite with a different value. */
  fields: AgentSyncFieldChange[];
  count: number;
  /**
   * True only when we KNOW the sync would change nothing. `unknown` never
   * produces `true` — an unreadable side is not proof of equality.
   */
  nothingToSync: boolean;
  /** True when the comparison could not be made. */
  unknown: boolean;
}

/**
 * What a sync in one direction, with these options, would actually overwrite.
 *
 * Pull defaults to behavior-only (the panel's identity checkbox is off by
 * default); Push always carries identity. That asymmetry is why "are they
 * identical?" is not a single boolean: a pair can be identical for everything
 * Pull will copy while still differing in name and description.
 */
export function agentSyncImpact(
  comparison: AgentSyncComparison,
  includeIdentity: boolean,
): AgentSyncImpact {
  if (comparison.verdict === "unknown") {
    return { fields: [], count: 0, nothingToSync: false, unknown: true };
  }
  const fields = includeIdentity
    ? comparison.changed
    : comparison.behaviorChanged;
  return {
    fields,
    count: fields.length,
    nothingToSync: fields.length === 0,
    unknown: false,
  };
}

/** One-line verdict for a sync direction, e.g. for a button title or a toast. */
export function describeAgentSyncImpact(
  impact: AgentSyncImpact,
  targetName: string,
): string {
  if (impact.unknown) {
    return `Could not compare — one side could not be read. Syncing would overwrite "${targetName}" with the other agent's config.`;
  }
  if (impact.nothingToSync) {
    return `Nothing to sync — "${targetName}" already matches for every field this would copy.`;
  }
  const names = impact.fields.map((f) => f.label).join(", ");
  return `Overwrites ${impact.count} field${impact.count === 1 ? "" : "s"} on "${targetName}": ${names}.`;
}
