// features/scopes/utils/scopeMismatch.ts
//
// Pure decision logic for the chat↔scope "ask on mismatch" pre-send gate.
//
// A chat carries its scopes durably (ctx_scope_assignments tags on the
// conversation — like a coding agent's attached repos). When the user's
// sidebar (active) selection differs from what the chat is tagged with, we
// ALWAYS ask — offer to switch / combine / keep. Never silently retag,
// never silently drop.
//
// This module is intentionally pure (no Redux, no React) so the gate
// condition is unit-testable in isolation. The thunk that drives the flow
// is features/scopes/redux/thunks/conversationScopeGate.ts; the dialog is
// components/dialogs/scope-mismatch/.

import type { OrgNode } from "@/features/scopes/types";

/** User's answer to the 3-way mismatch dialog (or a dismiss). */
export type ScopeMismatchChoice = "update" | "combine" | "keep" | "cancel";

/**
 * Pre-send gate decision, computed from
 *   A = the user's current active (sidebar) scope ids
 *   C = the conversation's tagged scope ids.
 *
 * - `proceed`   — no ask, no request override. Covers C = ∅ (new/untagged
 *                 chat: the post-send union sync stamps A) and A == C.
 * - `use-chat`  — A = ∅, C ≠ ∅: a bare sidebar never strips a chat's
 *                 context. No ask; the send carries C so the server
 *                 resolves the chat's own scopes.
 * - `ask`       — A ≠ ∅, C ≠ ∅, A ≠ C (set inequality): open the 3-way
 *                 dialog.
 */
export type ScopeMismatchGate =
  | { kind: "proceed" }
  | { kind: "use-chat"; scopeIds: string[] }
  | { kind: "ask" };

/** Set equality over scope-id lists (order- and duplicate-insensitive). */
export function sameScopeIdSet(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const id of setA) if (!setB.has(id)) return false;
  return true;
}

/** The gate condition. See {@link ScopeMismatchGate} for each branch. */
export function evaluateScopeMismatchGate(
  activeIds: readonly string[],
  chatIds: readonly string[],
): ScopeMismatchGate {
  if (chatIds.length === 0) return { kind: "proceed" };
  if (activeIds.length === 0) {
    return { kind: "use-chat", scopeIds: [...new Set(chatIds)] };
  }
  if (sameScopeIdSet(activeIds, chatIds)) return { kind: "proceed" };
  return { kind: "ask" };
}

/**
 * Maps the user's dialog choice to the target scope set — which becomes
 * BOTH this send's `scope_ids` AND the chat's durable tags.
 *
 * - `update`  → A  ("Use current selection")
 * - `combine` → A ∪ C ("Combine both")
 * - `keep`    → C  ("Keep chat's context" — no tag write needed)
 */
export function resolveScopeMismatchTarget(
  choice: Exclude<ScopeMismatchChoice, "cancel">,
  activeIds: readonly string[],
  chatIds: readonly string[],
): string[] {
  switch (choice) {
    case "update":
      return [...new Set(activeIds)];
    case "combine":
      return [...new Set([...activeIds, ...chatIds])];
    case "keep":
      return [...new Set(chatIds)];
  }
}

/**
 * Canonical key for an (A, C) set pair — order- and duplicate-insensitive.
 * The gate records the post-decision pair under this key so an unchanged
 * A/C combination never re-asks: "combine" and "keep" leave A ≠ C by
 * design, and re-opening the dialog on every send when the user already
 * answered for exactly this state would be nagging, not safety.
 */
export function scopeSetPairKey(
  activeIds: readonly string[],
  chatIds: readonly string[],
): string {
  const norm = (ids: readonly string[]) => [...new Set(ids)].sort().join(",");
  return `${norm(activeIds)}|${norm(chatIds)}`;
}

/** One scope rendered in the mismatch dialog: "Type: Name". */
export interface ScopeMismatchDisplayItem {
  id: string;
  name: string;
  typeLabel: string;
}

/**
 * Resolves scope ids to display items via the loaded scope tree. Ids not
 * found in the tree (deleted scope, other-org scope, tree not yet loaded)
 * fall back to a labelled unknown — the dialog must never hide a scope
 * just because its name can't be resolved.
 */
export function buildScopeDisplayItems(
  scopeIds: readonly string[],
  organizations: Record<string, OrgNode>,
): ScopeMismatchDisplayItem[] {
  const byId = new Map<string, ScopeMismatchDisplayItem>();
  for (const orgId of Object.keys(organizations)) {
    for (const type of organizations[orgId].scope_types) {
      for (const scope of type.scopes) {
        byId.set(scope.id, {
          id: scope.id,
          name: scope.name,
          typeLabel: type.label_singular,
        });
      }
    }
  }
  return [...new Set(scopeIds)].map(
    (id) =>
      byId.get(id) ?? { id, name: "Unknown scope", typeLabel: "Scope" },
  );
}
