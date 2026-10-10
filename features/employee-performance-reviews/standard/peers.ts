// features/employee-performance-reviews/standard/peers.ts
//
// PEER FEEDBACK display rules, pure so they can be proven: who may ask for it, what a peer is called on
// screen, and which nominations still await the manager. The DOOR decides who can READ a peer's words
// (manager and HR always, the employee only once shared, a peer only their own); this file only
// decides how what the door sent is labelled.

import type { PeerNomination, ResponseView, ReviewSummary } from "./types";

/** A peer's name on screen: the name only when the door sent it, never a guess, never a hint at who. */
export function peerLabel(r: Pick<ResponseView, "respondentName">, index: number): string {
  return r.respondentName ?? `Peer ${index + 1}`;
}

/** Peer requests are offered to the employee and the manager, while the review is still being written. */
export function canNominatePeers(args: { seat: string; peersEnabled: boolean; review: Pick<ReviewSummary, "cycleStatus" | "status"> }): boolean {
  if (!args.peersEnabled) return false;
  if (args.seat !== "employee" && args.seat !== "manager") return false;
  if (args.review.cycleStatus !== "open") return false;
  return !["shared", "acknowledged", "cancelled"].includes(args.review.status);
}

export const pendingNominations = (n: PeerNomination[]): PeerNomination[] => n.filter((x) => x.status === "pending");

export const NOMINATION_LABEL: Record<string, string> = {
  pending: "Waiting for the manager",
  approved: "Asked",
  declined: "Declined",
};

/** Submitted peer responses, in the order the door sent them. */
export const submittedPeerResponses = (responses: ResponseView[]): ResponseView[] => responses.filter((r) => r.role === "peer" && r.visible && r.answers !== null && r.status === "submitted");
