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
  /**
   * On the new side only (lane SWITCH-BACK-CARRIES): what Switch back will carry from the new tables
   * into the older ones, one sentence per table (and the tables that stay in the new system), as the
   * database measures it now — the Switch back dialog shows these before the press.
   */
  reverseCarries: string[];
  /** What Switch back cannot carry, by name. When any, the press needs the person's confirmation. */
  reverseNotCarried: string[];
  reverseNeedsConfirm: boolean;
  switched: { direction: SeamState; at: string; by: string | null } | null;
  /**
   * Switched for every organization at once by the final switch (lane SCOPES-WRITE-THROUGH: the
   * scope and context screens). One organization is switched only from the admin scope console, to
   * test it; an organization's own settings page lists it with the switches made for everyone.
   */
  pressedForEveryone?: boolean;
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
  /**
   * The final switch (lane FINAL-SWITCH): while it is on, every organization switched together and
   * switches back together from Administration → Database → Final switch; no seam is pressed here.
   */
  finalSwitch?: { state: SeamState; at: string | null; by: string | null } | null;
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
  reverse_readiness?: {
    ready: boolean;
    checked_at: string;
    checks: SeamCheck[];
    carries?: string[] | null;
    not_carried?: string[] | null;
    needs_confirm?: boolean | null;
  } | null;
  may_flip: boolean;
  may_reverse: boolean;
  pressed_for_everyone?: boolean;
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
      final_switch?: { state: SeamState; data_screen?: SeamState; at: string | null; by: string | null } | null;
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
  // FINAL-SWITCH: the platform switches' state lives on the platform, not on this organization's
  // presses. The read door answers them "old" from this organization's log, so the card asks the
  // platform's one state and says it (null — a database without the final switch — changes nothing).
  const final = raw.final_switch ?? (await readFinalSwitchStateForCard());
  const platformState = (key: string, state: SeamState): SeamState =>
    !final ? state : key === "final_switch" ? final.state : key === "data_screen" ? (final.data_screen ?? state) : state;
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
      state: s.press_kind === "platform_switch" ? platformState(s.key, s.state) : s.state,
      flipDoes: s.flip_does,
      needsFirst: s.needs_first,
      reverseDoes: s.reverse_does,
      ready: s.readiness.ready,
      checkedAt: s.readiness.checked_at,
      checks: s.readiness.checks ?? [],
      // While the final switch is on no organization switches on its own (the database refuses it).
      mayFlip: s.may_flip && final?.state !== "new",
      mayReverse: s.may_reverse && final?.state !== "new",
      reverseChecks: s.reverse_readiness?.checks ?? [],
      reverseCarries: Array.isArray(s.reverse_readiness?.carries) ? s.reverse_readiness.carries : [],
      reverseNotCarried: Array.isArray(s.reverse_readiness?.not_carried) ? s.reverse_readiness.not_carried : [],
      reverseNeedsConfirm: s.reverse_readiness?.needs_confirm === true,
      switched: s.switched,
      pressedForEveryone: s.pressed_for_everyone === true,
      lastPress: s.last_press,
    })),
    finalSwitch: final ? { state: final.state, at: final.at, by: final.by } : null,
  };
}

/** The platform's final-switch state (lane FINAL-SWITCH); null on a database without it. */
async function readFinalSwitchStateForCard(): Promise<
  { state: SeamState; data_screen?: SeamState; at: string | null; by: string | null } | null
> {
  const { data, error } = await platformRpc().rpc("final_switch_state", {});
  if (error || !data || typeof data !== "object") return null;
  return data as { state: SeamState; data_screen?: SeamState; at: string | null; by: string | null };
}

/** Press one seam to `to`. The answer is the door's; a refusal carries its own sentence. */
export async function pressSeam(options: {
  organizationId: string;
  seamKey: string;
  to: SeamState;
  note?: string;
  /** Switch back only: the person confirmed leaving behind what cannot be carried (named first). */
  acceptNotCarried?: boolean;
}): Promise<PressAnswer> {
  const { data, error } = await platformRpc().rpc("cutover_seam_press", {
    p_seam_key: options.seamKey,
    p_organization_id: options.organizationId,
    p_to: options.to,
    p_note: options.note ?? null,
    p_accept_not_carried: options.acceptNotCarried === true,
  });
  if (error) return { ok: false, reason: "transport", says: `The switch could not be pressed: ${error.message}` };
  const answer = data as { ok: boolean; reason?: string; says?: string; state?: SeamState } | null;
  if (!answer) return { ok: false, reason: "no_answer", says: "The database answered nothing; nothing was changed." };
  if (answer.ok) return { ok: true, state: answer.state ?? options.to, says: answer.says ?? "" };
  return { ok: false, reason: answer.reason ?? "refused", says: answer.says ?? "The switch was refused." };
}
