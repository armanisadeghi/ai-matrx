// features/unified-data/cutover/seamSwitches.ts — THE ONE CLIENT FOR EVERY OLD → NEW SWITCH.
//
// A "seam" is a place where an old system and a new one stand side by side (the older data tables
// and their record-store copies; the current context system and its copy; …). Each one flips from
// old to new with ONE press by an owner, and back with one press. The database owns all of it:
//
//   platform.cutover_seams(org)                          — the state, readiness and what each flip
//                                                          does, measured now. Every client reads here.
//   platform.cutover_seam_press(seam, org, to, note)     — the press. Owner or platform admin only,
//                                                          signed in, from a page. The seam's own step
//                                                          (archive the older tables, set the switch)
//                                                          runs inside it; every press is recorded.
//
// This file adds no rule of its own: what may be pressed, and why not, is the door's answer, shown
// as it is. Lane FLIP-SEAMS, 2026-09-25.

import { createClient } from "@/utils/supabase/client";

export type SeamState = "old" | "new";

export type SeamCheck = {
  key: string;
  says: string;
  met: boolean;
  detail: string | null;
  /** For a fact the cutover census measures (every release re-runs it): when it was last measured. */
  measured_at?: string | null;
  /**
   * How many of this check's differences copying the older tables again clears, and how many it
   * leaves (each named in `detail` with what to do instead). Lane MOVER-CARRY-TAILS; absent on a
   * database without that file.
   */
  copy_again_clears?: number;
  copy_again_leaves?: number;
};

export type Seam = {
  key: string;
  title: string;
  oldSide: string;
  newSide: string;
  perOrganization: boolean;
  /** owner_press: pressed on this page · platform_switch: for everyone at once · already_switched. */
  pressKind: "owner_press" | "platform_switch" | "already_switched";
  state: SeamState;
  flipDoes: string;
  needsFirst: string;
  reverseDoes: string;
  ready: boolean;
  checkedAt: string;
  checks: SeamCheck[];
  mayFlip: boolean;
  mayReverse: boolean;
  /** On the new side only: what must be true before it may go back (nothing left behind). */
  reverseChecks: SeamCheck[];
  switched: { direction: SeamState; at: string; by: string | null } | null;
  lastPress: {
    direction: SeamState;
    outcome: "done" | "refused";
    at: string;
    refusal: string | null;
    says: string | null;
  } | null;
};

export type SeamBoard = {
  organizationId: string;
  checkedAt: string;
  mayPress: boolean;
  mayPressDetail: string;
  seams: Seam[];
};

type RawSeam = {
  key: string;
  title: string;
  old_side: string;
  new_side: string;
  per_organization: boolean;
  press_kind: Seam["pressKind"];
  state: SeamState;
  flip_does: string;
  needs_first: string;
  reverse_does: string;
  readiness: { ready: boolean; checked_at: string; checks: SeamCheck[] };
  reverse_readiness?: { ready: boolean; checked_at: string; checks: SeamCheck[] } | null;
  may_flip: boolean;
  may_reverse: boolean;
  switched: { direction: SeamState; at: string; by: string | null } | null;
  last_press: Seam["lastPress"];
};

type RawBoard =
  | {
      ok: true;
      organization_id: string;
      checked_at: string;
      may_press: boolean;
      may_press_detail: string;
      seams: RawSeam[];
    }
  | { ok: false; reason: string; says: string };

export type PressAnswer =
  | { ok: true; state: SeamState; says: string }
  | { ok: false; reason: string; says: string };

function platformRpc() {
  const client = createClient();
  // The two doors are new; until the generated types carry them the call is typed by its answer.
  return client.schema("platform" as never) as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/** Every seam for one organization, measured now. Throws with the door's own sentence on refusal. */
export async function readSeamBoard(organizationId: string): Promise<SeamBoard> {
  const { data, error } = await platformRpc().rpc("cutover_seams", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(`The switches could not be read: ${error.message}`);
  const raw = data as RawBoard | null;
  if (!raw) throw new Error("The switches could not be read: the database answered nothing.");
  if (!raw.ok) throw new Error(raw.says);
  return {
    organizationId: raw.organization_id,
    checkedAt: raw.checked_at,
    mayPress: raw.may_press,
    mayPressDetail: raw.may_press_detail,
    seams: raw.seams.map((s) => ({
      key: s.key,
      title: s.title,
      oldSide: s.old_side,
      newSide: s.new_side,
      perOrganization: s.per_organization,
      pressKind: s.press_kind,
      state: s.state,
      flipDoes: s.flip_does,
      needsFirst: s.needs_first,
      reverseDoes: s.reverse_does,
      ready: s.readiness.ready,
      checkedAt: s.readiness.checked_at,
      checks: s.readiness.checks ?? [],
      mayFlip: s.may_flip,
      mayReverse: s.may_reverse,
      reverseChecks: s.reverse_readiness?.checks ?? [],
      switched: s.switched,
      lastPress: s.last_press,
    })),
  };
}

/** Press one seam to `to`. The answer is the door's; a refusal carries its own sentence. */
export async function pressSeam(options: {
  organizationId: string;
  seamKey: string;
  to: SeamState;
  note?: string;
}): Promise<PressAnswer> {
  const { data, error } = await platformRpc().rpc("cutover_seam_press", {
    p_seam_key: options.seamKey,
    p_organization_id: options.organizationId,
    p_to: options.to,
    p_note: options.note ?? null,
  });
  if (error) return { ok: false, reason: "transport", says: `The switch could not be pressed: ${error.message}` };
  const answer = data as { ok: boolean; reason?: string; says?: string; state?: SeamState } | null;
  if (!answer) return { ok: false, reason: "no_answer", says: "The database answered nothing; nothing was changed." };
  if (answer.ok) return { ok: true, state: answer.state ?? options.to, says: answer.says ?? "" };
  return { ok: false, reason: answer.reason ?? "refused", says: answer.says ?? "The switch was refused." };
}
