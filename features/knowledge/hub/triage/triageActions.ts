/**
 * features/knowledge/hub/triage/triageActions.ts — what triage DOES, as plain
 * functions over an injected door (the page and the tests call the same code),
 * and the ONE key map the page listens to and the "?" sheet prints.
 *
 * Champion: Readwise Reader — one key moves the item and the next one is
 * already under your cursor. Reader's own keys where they do not collide with
 * the hub's Linear keys: `e` archive (Reader, Gmail); keep is `s` because `k`
 * is already "move up" (j/k); file under is `m` ("move", Reader/Gmail) because
 * `f` is already the filter menu.
 */

import type { KnowledgeHit, TriageState } from "@/features/knowledge/api/knowledgeSearch";
import { uniqueTargets, type ActionOutcome, type ActionTarget } from "@/features/knowledge/hub/hubActions";
import { TRIAGE_LABEL } from "./triageApi";

/** The record's own organization rides along (a Source's keep door needs it; never the active org). */
export type SetTriageDoor = (
  entityToken: string,
  entityId: string,
  state: TriageState,
  organizationId?: string | null,
) => Promise<void>;

export interface TriageOutcome extends ActionOutcome {
  /** What to put back for Undo: each moved record and the state it came from. */
  undo: { target: ActionTarget; prior: TriageState }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const VERB: Record<TriageState, string> = {
  inbox: "Moved {n} back to your Inbox.",
  kept: "Kept {n}.",
  archived: "Archived {n}.",
};

/**
 * Move every target to `state`. A record that does not say where it sat
 * (a search result, not an Inbox row) came from the Inbox — where every
 * capture lands — so Undo puts it back there.
 */
export async function triageItems(
  hits: KnowledgeHit[],
  state: TriageState,
  setState: SetTriageDoor,
): Promise<TriageOutcome> {
  const priorByKey = new Map<string, TriageState>();
  for (const h of hits) {
    const t = uniqueTargets([h])[0];
    const prior = h.entity === "segment" ? null : (h.triage_state ?? null);
    priorByKey.set(`${t.entity}:${t.id}`, prior ?? "inbox");
  }
  const targets = uniqueTargets(hits);
  const failed: ActionOutcome["failed"] = [];
  const undo: TriageOutcome["undo"] = [];
  let ok = 0;
  for (const t of targets) {
    try {
      await setState(t.entity, t.id, state, t.organization_id ?? null);
      ok += 1;
      const prior = priorByKey.get(`${t.entity}:${t.id}`) ?? "inbox";
      if (prior !== state) undo.push({ target: t, prior });
    } catch (err) {
      failed.push({ target: t, message: err instanceof Error ? err.message : String(err) });
    }
  }
  let sentence = ok
    ? VERB[state].replace("{n}", ok === 1 && targets.length === 1 ? `"${targets[0].title}"` : plural(ok, "item"))
    : `Nothing was moved to ${TRIAGE_LABEL[state]}.`;
  if (failed.length) {
    const first = failed[0];
    const more = failed.length > 1 ? ` (and ${failed.length - 1} more)` : "";
    sentence += ` "${first.target.title}" was not moved: ${first.message}${more}`;
  }
  return { ok, failed, undo, sentence };
}

/** Put every moved record back where it was (the toast's Undo). */
export async function undoTriage(undo: TriageOutcome["undo"], setState: SetTriageDoor): Promise<ActionOutcome> {
  const failed: ActionOutcome["failed"] = [];
  let ok = 0;
  for (const u of undo) {
    try {
      await setState(u.target.entity, u.target.id, u.prior, u.target.organization_id ?? null);
      ok += 1;
    } catch (err) {
      failed.push({ target: u.target, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const sentence = failed.length
    ? `Put back ${plural(ok, "item")}; "${failed[0].target.title}" could not be: ${failed[0].message}`
    : `Put back ${plural(ok, "item")}.`;
  return { ok, failed, sentence };
}

// ─── The key map ────────────────────────────────────────────────────────────

export type TriageCommand = "keep" | "archive" | "inbox" | "file" | "tag" | "help";

export const TRIAGE_KEYS: readonly { key: string; command: TriageCommand; label: string }[] = [
  { key: "s", command: "keep", label: "Keep" },
  { key: "e", command: "archive", label: "Archive" },
  { key: "i", command: "inbox", label: "Back to Inbox" },
  { key: "m", command: "file", label: "File under…" },
  { key: "t", command: "tag", label: "Tag…" },
  { key: "?", command: "help", label: "Keyboard shortcuts" },
];

/** Every key the hub answers, grouped for the "?" sheet. */
export const HUB_KEY_SHEET: readonly { group: string; keys: { keys: string[]; label: string }[] }[] = [
  {
    group: "Move",
    keys: [
      { keys: ["j", "↓"], label: "Next item" },
      { keys: ["k", "↑"], label: "Previous item" },
      { keys: ["↵"], label: "Peek" },
      { keys: ["⌘", "↵"], label: "Open full" },
      { keys: ["Esc"], label: "Close peek / clear selection" },
    ],
  },
  {
    group: "Triage",
    keys: [
      { keys: ["s"], label: "Keep" },
      { keys: ["e"], label: "Archive" },
      { keys: ["i"], label: "Back to Inbox" },
      { keys: ["m"], label: "File under…" },
      { keys: ["t"], label: "Tag…" },
      { keys: ["a"], label: "Accept the first filing suggestion" },
    ],
  },
  {
    group: "Find",
    keys: [
      { keys: ["/"], label: "Search" },
      { keys: ["f"], label: "Filters" },
      { keys: ["x"], label: "Select item" },
      { keys: ["⌥", "V"], label: "Save view" },
      { keys: ["?"], label: "This sheet" },
    ],
  },
];

/** A key press → the triage command it means, or null. Modifiers never triage. */
export function triageCommandForKey(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): TriageCommand | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return TRIAGE_KEYS.find((k) => k.key === e.key)?.command ?? null;
}

/** After the focused item leaves the list, the next one takes the cursor (Reader). */
export function nextFocusAfterRemoval(keys: string[], removed: Set<string>, focused: string | null): string | null {
  if (!focused) return null;
  const i = keys.indexOf(focused);
  if (i < 0) return null;
  for (let j = i + 1; j < keys.length; j++) if (!removed.has(keys[j])) return keys[j];
  for (let j = i - 1; j >= 0; j--) if (!removed.has(keys[j])) return keys[j];
  return null;
}
