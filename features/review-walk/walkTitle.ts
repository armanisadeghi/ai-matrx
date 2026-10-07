/**
 * features/review-walk/walkTitle.ts — what a review-walk window is CALLED, and
 * where a new one lands. Pure, so the window, the opener and the test share it.
 *
 * Every walk used to be titled "Diagnose — agent request", so a freshly opened
 * walk could not be told from the one beneath it (Mandate Candidates FX3-W).
 * The title now names what the window shows: `<role> · <detail> · <agent>`
 * when a caller gave a short role ("Live" / "Candidate") and a detail that
 * tells its runs apart ("Pair 3" — two Live walks of one mandate share role
 * AND agent, FX-D2), the agent alone otherwise, and the unit kind only when
 * nothing else is known.
 */

/** Title budget — a window title is a label in a slot, never a sentence. */
export const WALK_TITLE_BUDGET = 40;
const ROLE_BUDGET = 12;
const DETAIL_BUDGET = 16;
export const WALK_CASCADE_SLOTS = 8;

const UNIT_TITLE: Record<string, string> = {
  assistant_message: "Diagnose",
  agent_request: "Diagnose — agent request",
  wf_node_outcome: "Diagnose — workflow step",
};

function clip(text: string, budget: number): string {
  return text.length <= budget ? text : `${text.slice(0, budget - 1).trimEnd()}…`;
}

export function walkTitle(args: {
  unitKind: string;
  agentName?: string | null;
  roleLabel?: string | null;
  detailLabel?: string | null;
}): string {
  const agent = args.agentName?.trim() || "";
  const role = args.roleLabel?.trim() ? clip(args.roleLabel.trim(), ROLE_BUDGET) : "";
  const detail = args.detailLabel?.trim() ? clip(args.detailLabel.trim(), DETAIL_BUDGET) : "";
  const head = [role, detail].filter(Boolean).join(" · ");
  if (head && agent) {
    return clip(`${head} · ${clip(agent, WALK_TITLE_BUDGET - head.length - 3)}`, WALK_TITLE_BUDGET);
  }
  if (head) return clip(`${head} · ${UNIT_TITLE[args.unitKind] ?? args.unitKind}`, WALK_TITLE_BUDGET);
  if (agent) return clip(agent, WALK_TITLE_BUDGET);
  return UNIT_TITLE[args.unitKind] ?? `Diagnose — ${args.unitKind}`;
}

/**
 * The lowest cascade slot no open walk is using, so a new walk never lands
 * exactly on one that is already open (counting open windows reused a slot
 * whenever an earlier window had been closed).
 */
export function nextStackIndex(openStackIndexes: readonly unknown[]): number {
  const used = new Set(
    openStackIndexes.filter((n): n is number => typeof n === "number"),
  );
  for (let slot = 0; slot < WALK_CASCADE_SLOTS; slot++) {
    if (!used.has(slot)) return slot;
  }
  return openStackIndexes.length % WALK_CASCADE_SLOTS;
}
