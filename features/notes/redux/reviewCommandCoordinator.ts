import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { NoteEditableContentSource } from "@/features/rich-document/types";
import {
  captureReviewedNoteSave,
  saveReviewedNoteSnapshot,
  type NoteReviewedSaveResult,
  type NoteSaveObservation,
} from "./thunks";
import { canonicalNoteSnapshotValue } from "../noteSnapshotEquality";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export type ReviewCommandTerminal = {
  requestId: string;
  actorId: string;
  noteId: string;
  organizationId: string;
  decisionId: string;
  reviewId: string;
  result: NoteReviewedSaveResult | { status: "refused"; reason: string };
  /** Immutable source package originally admitted to the existing writer. */
  attemptedSource: Readonly<NoteEditableContentSource>;
};

export type ReviewCommandPending = Omit<ReviewCommandTerminal, "result"> & {
  result: { status: "pending" };
};

export type ReviewCommandOutcome = ReviewCommandTerminal | ReviewCommandPending;

type Operation = { identity: string; outcome: ReviewCommandOutcome };
type Entry = {
  outcomes: Map<string, Operation>;
  pending: Set<string>;
  versions: Map<string, number>;
  listeners: Map<string, Set<() => void>>;
};

const ledgers = new WeakMap<() => RootState, Entry>();

function ledger(getState: () => RootState): Entry {
  const existing = ledgers.get(getState);
  if (existing) return existing;
  const next: Entry = { outcomes: new Map(), pending: new Set(), versions: new Map(), listeners: new Map() };
  ledgers.set(getState, next);
  return next;
}

function actor(getState: () => RootState): string | null {
  return getState().userAuth.id;
}

function notify(getState: () => RootState, actorId: string): void {
  const state = ledger(getState);
  state.versions.set(actorId, (state.versions.get(actorId) ?? 0) + 1);
  if (actor(getState) !== actorId) return;
  for (const listener of state.listeners.get(actorId) ?? []) {
    try {
      listener();
    } catch (error) {
      reportCoordinatorError("review-command-notify", error);
    }
  }
}

export function getReviewCommandOutcomesVersion(getState: () => RootState): number {
  const actorId = actor(getState);
  return actorId ? ledger(getState).versions.get(actorId) ?? 0 : 0;
}

export function subscribeReviewCommandOutcomes(getState: () => RootState, listener: () => void): () => void {
  const actorId = actor(getState);
  if (!actorId) return () => {};
  const listeners = ledger(getState).listeners.get(actorId) ?? new Set<() => void>();
  ledger(getState).listeners.set(actorId, listeners);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readReviewCommandOutcomes(getState: () => RootState): readonly ReviewCommandOutcome[] {
  const actorId = actor(getState);
  if (!actorId) return [];
  return [...ledger(getState).outcomes.values()].map((operation) => operation.outcome).filter((outcome) => outcome.actorId === actorId);
}

export function acknowledgeReviewCommandOutcome(getState: () => RootState, request: Pick<ReviewCommandTerminal, "requestId" | "actorId" | "decisionId" | "reviewId">): boolean {
  if (actor(getState) !== request.actorId) return false;
  const state = ledger(getState);
  if (state.pending.has(request.requestId)) return false;
  const operation = state.outcomes.get(request.requestId);
  const outcome = operation?.outcome;
  if (!outcome || outcome.actorId !== request.actorId || outcome.decisionId !== request.decisionId || outcome.reviewId !== request.reviewId) return false;
  state.outcomes.delete(request.requestId);
  notify(getState, request.actorId);
  return true;
}

/** Starts the existing prepared Notes writer exactly once; this owns its observer after admission. */
export function startReviewSaveCommand(args: {
  dispatch: ThunkDispatch<RootState, unknown, UnknownAction>;
  getState: () => RootState;
  source: NoteEditableContentSource;
  decisionId: string;
  reviewId: string;
  requestId: string;
}): { status: "started"; requestId: string } | { status: "refused"; reason: string } {
  const { dispatch, getState, source, decisionId, reviewId, requestId: id } = args;
  const actorId = actor(getState);
  if (!actorId || actorId !== source.editBase.actorId) return { status: "refused", reason: "session-changed" };
  const identity = canonicalNoteSnapshotValue({ actorId, decisionId, reviewId, source });
  const state = ledger(getState);
  const existing = state.outcomes.get(id);
  if (existing) return existing.identity === identity ? { status: "started", requestId: id } : { status: "refused", reason: "command-changed" };
  const locked = Object.values(getState().notes.retainedConflictReviews).some((review) =>
    review.actorId === actorId && review.noteId === source.noteId && review.decisionId === decisionId && review.reviewId === reviewId && review.command.status === "pending" && review.command.requestId === id,
  );
  if (!locked) return { status: "refused", reason: "command-changed" };
  let capture;
  try { capture = dispatch(captureReviewedNoteSave(source)); } catch { return { status: "refused", reason: "invalid-permit" }; }
  if (capture.status !== "captured") return capture;
  const attemptedSource = freezePackage(structuredClone(source));
  const pending: ReviewCommandPending = { requestId: id, actorId, noteId: source.noteId, organizationId: source.editBase.organizationId, decisionId, reviewId, attemptedSource, result: { status: "pending" } };
  state.outcomes.set(id, { identity, outcome: pending });
  state.pending.add(id);
  notify(getState, actorId);
  let observation: NoteSaveObservation;
  try { observation = dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); } catch {
    state.pending.delete(id); state.outcomes.set(id, { identity, outcome: { ...pending, result: { status: "refused", reason: "unavailable" } } }); notify(getState, actorId); return { status: "started", requestId: id };
  }
  void (async () => {
    try {
      const result = await observation.result;
      state.pending.delete(id);
      state.outcomes.set(id, { identity, outcome: { ...pending, result: projectResult(result) } });
      notify(getState, actorId);
    } catch {
      state.pending.delete(id);
      state.outcomes.set(id, { identity, outcome: { ...pending, result: { status: "refused", reason: "unavailable" } } });
      notify(getState, actorId);
    } finally {
      try { observation.release(); } catch (error) { reportCoordinatorError("review-command-release", error); }
    }
  })().catch((error) => reportCoordinatorError("review-command-settle", error));
  return { status: "started", requestId: id };
}

function projectResult(result: NoteReviewedSaveResult): NoteReviewedSaveResult {
  const projected = structuredClone(result);
  if ("receipt" in projected && projected.receipt) delete projected.receipt.postSaveRecoveryError;
  return freezePackage(projected);
}

function freezePackage<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freezePackage(nested);
    Object.freeze(value);
  }
  return value;
}

function reportCoordinatorError(relation: string, error: unknown): void {
  // Diagnostics must never change a physical write's settlement.
  try {
    captureError({ source: "runtime-exception", operation: "unknown", relation,
      message: "The reviewed-save coordinator encountered a runtime error.", raw: error });
  } catch { /* The capture store must not break the existing save observer. */ }
}
