/**
 * The super-admin attention dock — the ONE place a person responsible for the
 * platform is told what needs them, on every page, with a way out.
 *
 * THE DEFECT THIS EXISTS FOR (Arman, 2026-09-14). Two floating notices had
 * grown side by side — the schedule alarm (bottom-right) and the provider
 * outage notice (top-centre) — each with its own snooze, its own mute store,
 * its own layout marker and its own idea of a row. The schedule one had
 * become furniture: "It keeps reminding me and telling me that things are
 * off, but some of these things should be off … it's not giving me an out."
 * Three commerce schedules were red for sixteen days because the commerce
 * module is unbuilt. Nothing on the card said where in the product the
 * damage showed, which run failed, or what to click.
 *
 * THE MODEL. A SOURCE turns a server read into ITEMS. An item is a decision,
 * not a title: severity, the record (a door), a short state, one honest
 * sentence, the pages it breaks (doors), the evidence (doors), the actions
 * that fix it, and a mute — timed, never permanent — that is either a fact
 * about the record (stored on the row, visible to every super-admin) or a
 * preference of this browser (stored locally, for things with no row of
 * their own, such as a provider outage id). The dock composes every source
 * into one card, one pill, one snooze, one runway marker.
 *
 * Adding a concern = one source module + one hook. The dock does not change.
 */

export type AttentionSeverity = "critical" | "warning";

/** A page the person can open from the row — where the damage shows, or the evidence. */
export interface AttentionDoor {
  href: string;
  label: string;
  /** The symptom on that page, in plain words — shown as the tooltip. */
  what?: string;
  kind: "impact" | "evidence";
}

export interface AttentionAction {
  id: string;
  label: string;
  variant?: "default" | "destructive" | "outline" | "secondary";
  /**
   * A destructive/expensive click states its consequence first
   * (common-docs/policies/destructive-and-expensive-actions.md): what fires,
   * when, and what happens if the cause is not fixed.
   */
  confirm?: {
    title: string;
    description: string;
    confirmLabel: string;
    variant?: "default" | "destructive";
  };
  run: () => Promise<void>;
}

export interface AttentionMuteState {
  /** ISO — a mute ALWAYS ends. */
  until: string;
  reason: string | null;
  by: string | null;
}

export interface AttentionMute {
  /**
   * `server`: the mute is a fact about the record, stored on it, seen by
   * every super-admin on every device. `local`: this browser only, for
   * things that have no row of their own.
   */
  scope: "server" | "local";
  current: AttentionMuteState | null;
  apply: (untilMs: number, note: string | null) => Promise<void>;
  /** Absent when the mute cannot be lifted early (never the case today). */
  clear: (() => Promise<void>) | null;
}

export interface AttentionItem {
  /** `${sourceId}:${id}` — unique across sources; the local mute key. */
  key: string;
  sourceId: string;
  id: string;
  severity: AttentionSeverity;
  /** The record's name. */
  title: string;
  /** Short state, e.g. "switched off 16 days ago", "2 runs failed in a row". */
  state: string;
  /** One honest sentence — rendered through TextWithDoors, never as flat text. */
  sentence: string;
  /** What the job is for, when the record carries a description. */
  about: string | null;
  /** The record door — absent for things with no record (an outage). */
  record: { token: string; id: string; href: string } | null;
  doors: AttentionDoor[];
  /**
   * `true`: the job declared the pages it feeds (doors of kind `impact`).
   * `false`: it has not, and the row says so. `null`: not applicable.
   */
  impactDeclared: boolean | null;
  actions: AttentionAction[];
  mute: AttentionMute;
}

export interface AttentionSourceState {
  id: string;
  label: string;
  items: AttentionItem[];
  status: "idle" | "loading" | "ok" | "failed";
  error: string | null;
  /**
   * Whether a FAILED read is said on the dock. A direct DB read that fails
   * must be said (silence reads as healthy); a Python poll that fails is
   * already captured once by lib/python-client and a loud card on a timer is
   * the "complains constantly" defect.
   */
  loud: boolean;
  /** One sentence summarising the LIVE (un-muted) items, for the dock title. */
  summarize: (live: readonly AttentionItem[]) => string | null;
  review: { href: string; label: string } | null;
  refetch: () => void;
}
