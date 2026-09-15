"use client";

// THE ONE CONFLICT CHOREOGRAPHY.
//
// Every note editor — desktop `NoteContentEditor`, phone `MobileNoteEditor`,
// and any future host — drives a CAS conflict through THIS hook. It owns the
// whole two-phase reviewed-save flow and hands the host nothing but props:
//
//   • the retained-review key/state reads (`currentConflictReviewKeys` →
//     `retainedConflictReviews`) and the actor binding,
//   • the begin/settle command lock around every decision,
//   • the four decision handlers (Keep Mine / Save merged, Accept remote,
//     Dismiss, Refresh) with their receipt handling,
//   • phase two: the pending reviewed merge that only the mounted editor's
//     OWN re-emitted content source may start (`startReviewSaveCommand`),
//   • the props for the canonical `NoteConflictWindow`.
//
// Before this hook existed, the desktop editor held ~250 inline lines of it
// and the phone editor held a second, shorter glue path that resolved the
// decision and then called `saveNote` — one operation with two choreographies,
// i.e. a drift class. Keep-Mine on a phone now produces exactly the desktop
// dispatch sequence, coordinator receipt included.
//
// NEVER resolve a conflict with `markNoteSaved({id})` (no snapshot): it wipes
// ALL dirty fields, so the queued save bails on `!_dirty` and nothing is
// written — "Keep mine" was a silent no-op and, with the stale updated_at
// still in place, the conflict re-fired on the next keystroke forever
// (2026-07 freeze class).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { materializeReviewSession, type ReviewSessionAction } from "@ai-matrx/diff";
import type { ContentSource, NoteEditableContentSource } from "@/features/rich-document/types";
import {
  captureNoteConflictLiveBuffer,
  dismissNoteConflict,
  reopenNoteConflict,
  chooseRetainedNoteReviewSource,
  beginRetainedNoteConflictCommand,
  settleRetainedNoteConflictCommand,
  transitionRetainedNoteConflictReview,
  setRetainedNoteConflictProposal,
} from "../redux/slice";
import { refreshNoteConflictReview, resolveNoteConflict } from "../redux/thunks";
import {
  acknowledgeReviewCommandOutcome,
  getReviewCommandOutcomesVersion,
  readReviewCommandOutcomes,
  startReviewSaveCommand,
  subscribeReviewCommandOutcomes,
  type ReviewCommandOutcome,
} from "../redux/reviewCommandCoordinator";
import { equalNoteSnapshotValue } from "../noteSnapshotEquality";
import { displayedPhysicalSnapshot } from "../richDocumentSource";
import { analyzeDiff } from "../utils/diffAnalysis";
import type { NoteConflictWindowProps } from "../components/NoteConflictWindow";
import type { NoteConflictDecision, NoteRecord } from "../redux/notes.types";

export interface NoteConflictChoreographyArgs {
  noteId: string;
  /** The live Redux record, or null/undefined while it is unavailable. */
  record: NoteRecord | null | undefined;
  /** Title shown in the conflict window header. */
  noteTitle: string;
  /** The editor's live (pre-debounce) buffer, as rendered. */
  localContent: string;
  /** Whatever `usePreparedNoteContentSource` returned for this mounted editor. */
  editableContentSource: ContentSource | undefined;
  editorMountedRef: MutableRefObject<boolean>;
  noteIdRef: MutableRefObject<string>;
  localContentRef: MutableRefObject<string>;
  /** Adopt an applied receipt's content into the host's buffer + redux mirror. */
  adoptResolvedContent: (content: string) => void;
}

export interface NoteConflictChoreography {
  conflictDecision: NoteConflictDecision | null;
  conflictError: string | null;
  /** Null unless a live, undismissed comparison should be on screen. */
  conflictWindowProps: NoteConflictWindowProps | null;
  /** True while a dismissed decision is still reopenable. */
  dismissedReviewAvailable: boolean;
  reopenConflict: () => void;
  /** Clear the host-local review draft + error when the editor swaps notes. */
  resetForNoteSwitch: () => void;
  /** Terminal reviewed-save outcomes for THIS note, awaiting acknowledgement. */
  reviewOutcomes: readonly ReviewCommandOutcome[];
  acknowledgeOutcome: (outcome: ReviewCommandOutcome) => void;
}

export function useNoteConflictChoreography({
  noteId,
  record,
  noteTitle,
  localContent,
  editableContentSource,
  editorMountedRef,
  noteIdRef,
  localContentRef,
  adoptResolvedContent,
}: NoteConflictChoreographyArgs): NoteConflictChoreography {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const reviewOutcomeVersion = useSyncExternalStore(
    (listener) => subscribeReviewCommandOutcomes(store.getState, listener),
    () => getReviewCommandOutcomesVersion(store.getState),
    () => 0,
  );
  // The subscription version is actor-scoped; read on every notified render so
  // an A→B→A session never observes another actor's retained outcome.
  void reviewOutcomeVersion;
  const reviewCommandOutcomes = readReviewCommandOutcomes(store.getState);

  // A conflict is created only by a full service CAS rejection. Realtime may
  // record newer evidence, but it cannot open a modal or replace this base.
  const conflictDecision = record?._conflictDecision ?? null;
  const conflictActorId = useAppSelector((state) => state.userAuth.id);
  const retainedConflictReview = useAppSelector((state) => {
    const key = state.notes.currentConflictReviewKeys?.[noteId];
    return key ? state.notes.retainedConflictReviews[key] ?? null : null;
  });

  const [mergeDraft, setMergeDraft] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [pendingReviewedMerge, setPendingReviewedMerge] = useState<null | {
    reviewKey: string; token: string; decisionId: string; reviewId: string; actorId: string; sourceId: string; candidate: string;
    acknowledged: NoteEditableContentSource["acknowledgedPhysicalSnapshot"];
    displayed: NoteEditableContentSource["displayedPhysicalSnapshot"];
  }>(null);

  const mountedEditableContentSource =
    editableContentSource?.type === "note" && editableContentSource.mode === "editable"
      ? editableContentSource
      : undefined;

  const pendingReviewCommandRef = useRef<{ reviewKey: string; actorId: string; requestId: string } | null>(null);
  useEffect(() => {
    return () => {
      const pending = pendingReviewCommandRef.current;
      if (pending) dispatch(settleRetainedNoteConflictCommand({ ...pending, error: "The editor closed before the reviewed save was admitted. Your review is retained." }));
      pendingReviewCommandRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!conflictDecision || conflictDecision.reviewedLiveContent !== null) return;
    dispatch(captureNoteConflictLiveBuffer({
      id: noteId,
      content: localContentRef.current,
    }));
  }, [dispatch, noteId, conflictDecision, localContentRef]);

  useEffect(() => {
    if (conflictDecision) return;
    setMergeDraft(null);
    setConflictError(null);
  }, [conflictDecision]);

  const getLiveBuffer = useCallback(
    () => (editorMountedRef.current && noteIdRef.current === noteId ? localContentRef.current : null),
    [editorMountedRef, noteIdRef, localContentRef, noteId],
  );

  const handleReviewTransition = useCallback((transition: ReviewSessionAction) => {
    if (!retainedConflictReview || !conflictActorId) return;
    dispatch(transitionRetainedNoteConflictReview({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictActorId, transition }));
  }, [dispatch, retainedConflictReview, conflictActorId]);

  const handleReviewProposalChange = useCallback((proposal: string) => {
    if (!retainedConflictReview || !conflictActorId) { setMergeDraft(proposal); return; }
    dispatch(setRetainedNoteConflictProposal({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictActorId, proposal }));
  }, [dispatch, retainedConflictReview, conflictActorId]);

  // ── Conflict resolution handlers ─────────────────────────────────-
  const handleKeepMine = useCallback(
    async (editedContent: string, choice: "mine" | "merge" = "mine") => {
      if (pendingReviewedMerge || !retainedConflictReview || !conflictDecision || conflictDecision.stale || !record || !mountedEditableContentSource) return;
      if (retainedConflictReview.refreshSourceReviewKey !== null) { setConflictError("Choose the text for the refreshed review first."); return; }
      const mountedSource = mountedEditableContentSource;
      const commandToken = crypto.randomUUID();
      if (mountedSource.noteId !== noteId || mountedSource.editBase.actorId !== conflictDecision.actorId) {
        setConflictError("Your mounted editor changed. Refresh before saving this review.");
        return;
      }
      if (
        !equalNoteSnapshotValue(mountedSource.displayedPhysicalSnapshot.metadata, conflictDecision.currentRow.metadata) ||
        mountedSource.displayedPhysicalSnapshot.position !== conflictDecision.currentRow.position ||
        mountedSource.displayedPhysicalSnapshot.organization_id !== conflictDecision.currentRow.organization_id
      ) {
        setConflictError("This review includes unsupported metadata, position, or organization changes. Keep those edits and resolve them separately.");
        return;
      }
      if (retainedConflictReview && choice === "merge") {
        const materialized = materializeReviewSession(retainedConflictReview.session);
        if (materialized.kind !== "complete") {
          setConflictError("Resolve every change before saving the reviewed result.");
          return;
        }
        editedContent = materialized.candidate;
      }
      if (retainedConflictReview) {
        dispatch(beginRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId: commandToken, sessionId: retainedConflictReview.session.sessionId, revision: retainedConflictReview.session.revision }));
        if (store.getState().notes.retainedConflictReviews[retainedConflictReview.reviewKey]?.command.requestId !== commandToken) return;
      }
      pendingReviewCommandRef.current = { reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId: commandToken };
      const outcome = await dispatch(resolveNoteConflict({ noteId, decisionId: conflictDecision.decisionId, reviewId: conflictDecision.reviewId, commandRequestId: commandToken, choice: "mine", proposedContent: editedContent, getLiveBuffer }));
      if (outcome.status !== "applied" || !editorMountedRef.current || noteIdRef.current !== noteId || store.getState().userAuth.id !== conflictDecision.actorId) {
        setConflictError(outcome.status === "refused" ? outcome.reason : "This conflict changed. Refresh before applying a choice.");
        if (retainedConflictReview) dispatch(settleRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId: commandToken, error: outcome.status === "refused" ? outcome.reason : "This conflict changed." }));
        return;
      }
      // The reducer installed the reviewed remote acknowledgement. Do not
      // fabricate its successor: the mounted hook supplies it after render.
      adoptResolvedContent(outcome.content);
      setPendingReviewedMerge({
        reviewKey: retainedConflictReview.reviewKey, token: commandToken, decisionId: conflictDecision.decisionId, reviewId: conflictDecision.reviewId, actorId: conflictDecision.actorId, sourceId: mountedSource.sourceId, candidate: editedContent,
        acknowledged: displayedPhysicalSnapshot(conflictDecision.currentRow),
        displayed: { ...mountedSource.displayedPhysicalSnapshot, version: conflictDecision.currentRow.version, content: editedContent },
      });
    },
    [dispatch, noteId, conflictDecision, record, retainedConflictReview, mountedEditableContentSource, pendingReviewedMerge, store, adoptResolvedContent, getLiveBuffer, editorMountedRef, noteIdRef],
  );

  useEffect(() => {
    if (!pendingReviewedMerge) return;
    const refuse = (message: string) => {
      setConflictError(message);
      dispatch(settleRetainedNoteConflictCommand({ reviewKey: pendingReviewedMerge.reviewKey, actorId: pendingReviewedMerge.actorId, requestId: pendingReviewedMerge.token, error: message }));
      pendingReviewCommandRef.current = null;
      setPendingReviewedMerge(null);
    };
    // This is phase two. It intentionally accepts only the actual source
    // emitted by this mounted editor after the reviewed reducer rebase.
    if (!mountedEditableContentSource) {
      refuse("The editor was closed before the reviewed save could start.");
      return;
    }
    if (
      noteIdRef.current !== noteId ||
      conflictActorId !== pendingReviewedMerge.actorId ||
      mountedEditableContentSource.sourceId !== pendingReviewedMerge.sourceId ||
      mountedEditableContentSource.noteId !== noteId ||
      !equalNoteSnapshotValue(mountedEditableContentSource.acknowledgedPhysicalSnapshot, pendingReviewedMerge.acknowledged) ||
      !equalNoteSnapshotValue(mountedEditableContentSource.displayedPhysicalSnapshot, pendingReviewedMerge.displayed)
    ) {
      refuse("Your editor changed before the reviewed save could start. The review remains available.");
      return;
    }
    const started = startReviewSaveCommand({ dispatch, getState: store.getState, source: mountedEditableContentSource, decisionId: pendingReviewedMerge.decisionId, reviewId: pendingReviewedMerge.reviewId, requestId: pendingReviewedMerge.token });
    if (started.status === "refused") { refuse(started.reason); return; }
    pendingReviewCommandRef.current = null; // The coordinator now owns physical settlement.
    setPendingReviewedMerge(null);
  }, [pendingReviewedMerge, mountedEditableContentSource, conflictActorId, noteId, dispatch, store, noteIdRef]);

  useEffect(() => {
    for (const outcome of reviewCommandOutcomes) {
      if (outcome.result.status === "pending") continue;
      const key = store.getState().notes.currentConflictReviewKeys[outcome.noteId];
      const review = key ? store.getState().notes.retainedConflictReviews[key] : undefined;
      if (review?.command.requestId === outcome.requestId) {
        dispatch(settleRetainedNoteConflictCommand({ reviewKey: review.reviewKey, actorId: outcome.actorId, requestId: outcome.requestId }));
      }
    }
  }, [dispatch, reviewCommandOutcomes, store]);

  const handleAcceptRemote = useCallback(async () => {
    if (!conflictDecision || conflictDecision.stale || !record || pendingReviewedMerge) return;
    const requestId = crypto.randomUUID();
    if (retainedConflictReview) {
      dispatch(beginRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId, sessionId: retainedConflictReview.session.sessionId, revision: retainedConflictReview.session.revision }));
      if (store.getState().notes.retainedConflictReviews[retainedConflictReview.reviewKey]?.command.requestId !== requestId) return;
    }
    const outcome = await dispatch(resolveNoteConflict({ noteId, decisionId: conflictDecision.decisionId, reviewId: conflictDecision.reviewId, commandRequestId: requestId, choice: "theirs", proposedContent: conflictDecision.currentRow.content ?? "", getLiveBuffer }));
    if (outcome.status !== "applied" || !editorMountedRef.current || noteIdRef.current !== noteId || store.getState().userAuth.id !== conflictDecision.actorId) {
      const error = outcome.status === "refused" ? outcome.reason : "This conflict changed. Refresh before applying a choice.";
      setConflictError(error);
      if (retainedConflictReview) dispatch(settleRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId, error }));
      return;
    }
    adoptResolvedContent(outcome.content);
    if (retainedConflictReview) dispatch(settleRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId }));
  }, [dispatch, noteId, conflictDecision, record, pendingReviewedMerge, retainedConflictReview, store, adoptResolvedContent, getLiveBuffer, editorMountedRef, noteIdRef]);

  const handleCancelConflict = useCallback(() => {
    // Dismissal keeps the unresolved decision and draft available to reopen.
    dispatch(dismissNoteConflict({ id: noteId }));
  }, [dispatch, noteId]);

  const handleRefreshConflict = useCallback(async () => {
    if (!conflictDecision || !record || pendingReviewedMerge) return;
    const requestId = crypto.randomUUID();
    if (retainedConflictReview) {
      dispatch(beginRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId, sessionId: retainedConflictReview.session.sessionId, revision: retainedConflictReview.session.revision }));
      if (store.getState().notes.retainedConflictReviews[retainedConflictReview.reviewKey]?.command.requestId !== requestId) return;
    }
    setConflictError(null);
    const outcome = await dispatch(refreshNoteConflictReview({ commandRequestId: requestId, noteId, decisionId: conflictDecision.decisionId, reviewId: conflictDecision.reviewId, getLiveBuffer }));
    if (outcome.status === "refused") setConflictError(outcome.reason);
    if (retainedConflictReview) dispatch(settleRetainedNoteConflictCommand({ reviewKey: retainedConflictReview.reviewKey, actorId: conflictDecision.actorId, requestId, ...(outcome.status === "refused" ? { error: outcome.reason } : {}) }));
  }, [dispatch, noteId, conflictDecision, record, pendingReviewedMerge, retainedConflictReview, store, getLiveBuffer]);

  // Memoized — analyzeDiff builds an O(lines²) LCS matrix. Computing it
  // inline in JSX re-ran it on EVERY render (i.e. every keystroke while a
  // conflict was open), which alone could saturate the main thread on a
  // large note (2026-07 freeze class).
  const conflictAnalysis = useMemo(
    () =>
      conflictDecision != null
        ? analyzeDiff(localContent, conflictDecision.currentRow.content ?? "")
        : null,
    [localContent, conflictDecision],
  );

  const resetForNoteSwitch = useCallback(() => {
    setMergeDraft(null);
    setConflictError(null);
  }, []);

  const reopenConflict = useCallback(() => {
    dispatch(reopenNoteConflict({ id: noteId }));
  }, [dispatch, noteId]);

  const noteReviewOutcomes = useMemo(
    () => reviewCommandOutcomes.filter((outcome) => outcome.noteId === noteId),
    [reviewCommandOutcomes, noteId],
  );

  const acknowledgeOutcome = useCallback((outcome: ReviewCommandOutcome) => {
    if (acknowledgeReviewCommandOutcome(store.getState, outcome)) setConflictError(null);
  }, [store]);

  const conflictWindowProps: NoteConflictWindowProps | null =
    conflictDecision != null && !conflictDecision.dismissed && conflictAnalysis != null
      ? {
          noteTitle,
          localContent,
          remoteContent: conflictDecision.currentRow.content ?? "",
          analysis: conflictAnalysis,
          mergeDraft: retainedConflictReview?.proposal ?? mergeDraft ?? localContent,
          onMergeDraftChange: handleReviewProposalChange,
          ...(retainedConflictReview?.session ? { reviewSession: retainedConflictReview.session } : {}),
          onReviewTransition: handleReviewTransition,
          remoteDetails: [
            { label: "Title", yours: record?.label ?? "Untitled", saved: conflictDecision.currentRow.label ?? "Untitled" },
            { label: "Folder", yours: `${record?.folder_name ?? "Uncategorized"} (${record?.folder_id ?? "no folder"})`, saved: `${conflictDecision.currentRow.folder_name ?? "Uncategorized"} (${conflictDecision.currentRow.folder_id ?? "no folder"})` },
            { label: "Organization", yours: record?.organization_id ?? "Unavailable", saved: conflictDecision.currentRow.organization_id ?? "Unavailable" },
            { label: "Tags", yours: record?.tags?.join(", ") || "None", saved: conflictDecision.currentRow.tags?.join(", ") || "None" },
            { label: "Visibility", yours: record?.visibility ?? "", saved: conflictDecision.currentRow.visibility },
            { label: "Position", yours: String(record?.position ?? "Unset"), saved: String(conflictDecision.currentRow.position ?? "Unset") },
            {
              label: "Metadata",
              yours:
                record?.metadata && typeof record.metadata === "object"
                  ? `${Object.keys(record.metadata).length} fields`
                  : "None",
              saved:
                conflictDecision.currentRow.metadata && typeof conflictDecision.currentRow.metadata === "object"
                  ? `${Object.keys(conflictDecision.currentRow.metadata).length} fields`
                  : "None",
              metadata: { yours: record?.metadata, saved: conflictDecision.currentRow.metadata },
            },
          ],
          stale: conflictDecision.stale,
          decisionError: conflictError,
          locked: retainedConflictReview?.command.status === "pending",
          isCommandLocked: () => Object.values(store.getState().notes.retainedConflictReviews).some(review => review.noteId === noteId && review.command.status === "pending"),
          sourceChoiceRequired: retainedConflictReview?.refreshSourceReviewKey != null,
          canUseCompletedSource: (() => {
            const previousKey = retainedConflictReview?.refreshSourceReviewKey;
            const previous = previousKey ? store.getState().notes.retainedConflictReviews[previousKey] : undefined;
            return previous !== undefined && materializeReviewSession(previous.session).kind === "complete";
          })(),
          onChooseSource: (source) => {
            if (!retainedConflictReview?.refreshSourceReviewKey) return;
            dispatch(chooseRetainedNoteReviewSource({ reviewKey: retainedConflictReview.reviewKey, actorId: retainedConflictReview.actorId,
              sourceReviewKey: retainedConflictReview.refreshSourceReviewKey, source, sessionId: crypto.randomUUID() }));
          },
          onKeepMine: handleKeepMine,
          onAcceptChanges: handleAcceptRemote,
          onCancel: handleCancelConflict,
          onRefresh: handleRefreshConflict,
        }
      : null;

  return {
    conflictDecision,
    conflictError,
    conflictWindowProps,
    dismissedReviewAvailable: conflictDecision?.dismissed === true,
    reopenConflict,
    resetForNoteSwitch,
    reviewOutcomes: noteReviewOutcomes,
    acknowledgeOutcome,
  };
}
