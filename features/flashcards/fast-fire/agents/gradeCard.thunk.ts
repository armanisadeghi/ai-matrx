// features/flashcards/fast-fire/agents/gradeCard.thunk.ts
//
// FIRE-AND-FORGET grading (REQUIREMENTS §7, hard-requirement #4). The drill loop
// NEVER awaits this. For each card, the moment its window closes we:
//   1. upload the per-card clip → durable file_id (fileHandler.upload),
//   2. run the grader through the canonical headless primitive
//      (`runHeadlessAgentJson`, D126) with the audio as a message part,
//   3. dispatch `gradeResolved` INTO Redux (the grade reaches the UI ONLY this
//      way — never a same-tick re-read of state set elsewhere; the §5.3 killer
//      bug is structurally impossible),
//   4. record the attempt on the study spine, through the OFFLINE-AWARE writer.
//
// OFFLINE — THE SPLIT (IC-8). FastFire is the one mode whose grade is produced
// by a SERVER agent, so offline the two halves separate and are treated
// differently ON PURPOSE:
//   • THE OBSERVATION — "this learner answered card X in session S at time T,
//     spoken" — is captured locally and QUEUED. It is what the outbox exists
//     for: the drill's attempt count, session, and FSRS review instant all
//     survive a dropped connection and replay idempotently on reconnect.
//   • THE GRADE is DERIVED STATE and is still NEVER captured offline. It cannot
//     be produced here (the grader is a server agent) and this thunk never
//     invents one: a queued attempt carries `result: null`, always.
//   • THE AUDIO CLIP IS NOW RETAINED (2026-08-20). The clip is held in the
//     outbox alongside the observation, and the attempt is HELD BACK from the
//     ledger until the flush can upload it and grade it — see
//     `education/study/offline/replay.ts`. Previously the blob died with the
//     drill and the card landed ungraded AND audio-less: the learner's WORK was
//     counted, their ANSWER CONTENT was gone forever.
//
// WHY HOLD BACK rather than record now and attach the grade later. There is no
// second write that could attach it. `study_record_attempt` is idempotent BY
// ID — a replayed attempt id returns the existing row and deliberately touches
// nothing — and the only other path, `study_override_attempt`, stamps
// `is_manually_edited`/`edited_by`, which would brand an AI grade as the
// LEARNER'S own manual correction (the flag that exists for contest integrity),
// and cannot carry `response_audio_file_id`, `response_transcript` or
// `graded_by` at all. Recording ONCE, complete, is the only honest shape. The
// hold-back is bounded: after MAX_GRADE_RETRIES the flush records the bare
// observation rather than holding a learner's work hostage to a broken grader.
//
// This does NOT weaken the outbox's founding rule. What is stored offline is
// still only what the learner DID — what they said, and what they were asked.
// The grade is derived by the server at flush, exactly as it would have been.
// A held attempt is surfaced as `gradeSkipped`, which stays honest: no grade
// was produced DURING THE DRILL. The learner is told once per session.
//
// The grader resolves through the mandate (FC_MANDATES.gradeSpoken) — swap the
// agent behind it at /agents/mandates (the old localStorage agent-id config is
// RETIRED; bindings replaced it). NO-AUDIO GUARD: with no uploaded clip we
// STILL record a result-less attempt and mark the grade `skipped` — grading
// with no audio hallucinates a "correct" from the card back.
//
// Keyed by the STABLE card id throughout, so grades land on the right card even
// though they resolve out of order, long after the drill advanced past them.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fileHandler } from "@/features/files/handler/handler";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import {
  recordAttemptOfflineAware,
  type PendingGradeRequest,
} from "@/features/education/study/offline/recordAttemptOffline";
import type { ClipRejection } from "@/features/education/study/offline/outbox";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import {
  audioExtensionForType,
  normalizeAudioContentType,
} from "@/features/audio/utils/audio-mime";
import { verdictResult, type GradeResult } from "@/features/education/trust/types";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import { coerceSpokenGrade } from "./grading-core";
import {
  gradePending,
  gradeResolved,
  gradeSkipped,
  gradeFailed,
} from "../redux/fastFireSlice";

const FC_CARD_ITEM_TYPE = "fc_card";
const FAST_FIRE_METHOD = "fast_fire";

export interface GradeCardArgs {
  cardId: string;
  front: string;
  back: string;
  secondsAllowed: number;
  /** The per-card response clip assembled from the continuous stream. */
  clip: Blob | null;
  sessionId: string | null;
}

// Coercion of the grader's structured output is the shared `coerceSpokenGrade`
// (grading-core) — the ONE spoken-grade coercer. (This thunk carried a
// byte-for-byte inline copy as deliberate tech debt; deleted at the trust
// unification. FastFire's flat slice payload is built from the adapter below.)

/**
 * Grade one card. Returns nothing the drill needs — its whole job is the Redux
 * dispatches + the attempt record. Call it WITHOUT awaiting from the drill loop.
 */
export function gradeCard(args: GradeCardArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    const { cardId, front, back, secondsAllowed, clip, sessionId } = args;
    // Whose outbox an offline attempt joins. Read once, up front: the thunk is
    // fire-and-forget and can resolve long after the drill moved on.
    const userId = selectUserId(getState()) ?? "";

    // 1. Upload the per-card clip to a durable file_id (best-effort — a missing
    //    clip is not fatal; we still record the attempt result-less).
    let responseAudioFileId: string | null = null;
    if (clip && clip.size > 0) {
      try {
        // The capture core emits WAV; derive the extension/mime from the blob
        // itself rather than hard-coding a container, so the cloud-files row is
        // stored as the real audio type (not mislabelled webm/video).
        const mime = normalizeAudioContentType(clip.type || "audio/wav");
        const ext = audioExtensionForType(mime);
        const uploaded = await fileHandler.upload(
          {
            kind: "blob",
            blob: clip,
            fileName: `fastfire-${cardId}.${ext}`,
            mime,
          },
          {
            folderPath: CloudFolders.SYSTEM_FASTFIRE_RESPONSES,
            visibility: "personal",
            metadata: {
              origin: "fastfire",
              session_id: sessionId ?? null,
              card_id: cardId,
            },
          },
        );
        responseAudioFileId = uploaded.fileId ?? null;
      } catch (err) {
        console.error("[fastfire.gradeCard] clip upload failed:", err);
      }
    }

    // NO-AUDIO GUARD: skip the grader (record result-less) when no audio was
    // captured/uploaded. Grading with NO audio is worse than not grading: the
    // model has nothing to transcribe and hallucinates a "correct" answer from
    // the card back (the exact 100%-on-everything bug). This also makes
    // abort-mid-pad safe — an abandoned card whose clip resolved null never
    // launches a grader or records a fabricated grade.
    //
    // This is ALSO the offline path: with no network the upload above failed,
    // so there is no file id and no grade is possible RIGHT NOW. The two cases
    // diverge on ONE fact — whether the learner actually recorded something:
    //   • a clip exists but could not be uploaded → the answer is INCOMPLETE.
    //     It is held (clip + grader inputs) and graded at flush.
    //   • no clip at all (abort mid-pad, a dead mic) → there is nothing to
    //     hold and nothing to grade, ever. Record it result-less and move on.
    // Either way this thunk records no grade, which is the invariant.
    if (!responseAudioFileId) {
      dispatch(gradeSkipped({ cardId, responseAudioFileId, runId: sessionId }));
      await recordAttempt(
        {
          userId,
          cardId,
          sessionId,
          responseAudioFileId,
          result: null,
          scoreValue: null,
          score: null,
          transcript: null,
          gradedBy: null,
        },
        clip && clip.size > 0
          ? {
              clip,
              spec: {
                mandateKey: FC_MANDATES.gradeSpoken,
                front,
                back,
                secondsAllowed,
                folderPath: CloudFolders.SYSTEM_FASTFIRE_RESPONSES,
                uploadMetadata: {
                  origin: "fastfire",
                  session_id: sessionId ?? null,
                  card_id: cardId,
                },
                cardId,
                rubric: null,
                surface: "fastfire",
                sourceFeature: "education-fastfire",
                surfaceName: "matrx-user/education-fastfire",
              },
            }
          : null,
      );
      return;
    }

    dispatch(gradePending({ cardId, responseAudioFileId, runId: sessionId }));

    try {
      // 2. Attach the audio as a message part (NOT userInput — that's a string)
      //    and run the grader through the headless primitive.
      const part = await fileHandler.toContentPart({
        kind: "file_id",
        fileId: responseAudioFileId,
      });
      const runResult = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey: FC_MANDATES.gradeSpoken,
        surfaceKey: `fastfire-grade-${cardId}`,
        // NOT ephemeral: the platform's ephemeral path is half-built and
        // 404s against the v2 conversation gate (see /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/EPHEMERAL-RUNS.md).
        // We persist instead, and keep these out of the user's normal chats
        // via a distinct, system-marked source_feature (source-registry.ts).
        sourceFeature: "education-fastfire",
        surfaceName: "matrx-user/education-fastfire",
        variables: {
          front,
          back,
          seconds_allowed: secondsAllowed,
        },
        // No response_format override: the grader is OUR agent — its output
        // schema lives in its DB definition (edit it there via agent_author,
        // never a call-time override, which also wrecks the prod agent cache).
        messageParts: [part],
        timeoutMs: 120_000,
        pollIntervalMs: 200,
      });

      // 3. Coerce via the shared spoken coercer (partial-tolerant on error).
      const grade = coerceSpokenGrade(runResult.data);
      if (!grade) {
        // The run's OWN reason wins. A failed run already carries the specific
        // cause (a provider rejection, a timeout) — inventing "no structured
        // grade" here buried it: on 2026-08-17 every card in a session showed
        // that sentence while the real cause was a Google 400 on the grader's
        // thinking level. Only claim a shape problem when the run succeeded.
        throw new Error(
          runResult.error ?? "grader did not return a structured grade",
        );
      }
      // Flatten the SpokenGrade adapter onto the slice's per-card wire shape:
      // the verdict's result token + explanation, plus the spoken extras.
      const result = verdictResult(grade.verdict);
      const feedback = grade.verdict.explanation;

      // 4. Into Redux — the ONLY way the grade reaches the UI.
      dispatch(
        gradeResolved({
          cardId,
          runId: sessionId,
          score: grade.score,
          result,
          rubric: grade.rubric,
          transcript: grade.transcript,
          feedback,
          missing: grade.missing,
        }),
      );

      // 5. Record the attempt on the study spine (score jsonb shape unchanged:
      //    { rubric, missing, feedback }).
      await recordAttempt({
        userId,
        cardId,
        sessionId,
        responseAudioFileId,
        result,
        scoreValue: grade.score,
        score: {
          rubric: grade.rubric,
          missing: grade.missing,
          feedback,
        },
        transcript: grade.transcript || null,
        gradedBy: FC_MANDATES.gradeSpoken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "grading failed";
      console.error(`[fastfire.gradeCard] card ${cardId}:`, err);
      dispatch(gradeFailed({ cardId, error: message, runId: sessionId }));
      // Still record the attempt (result-less) so the response audio + session
      // are not lost just because the grade failed.
      await recordAttempt({
        userId,
        cardId,
        sessionId,
        responseAudioFileId,
        result: null,
        scoreValue: null,
        score: { grade_error: message },
        transcript: null,
        gradedBy: FC_MANDATES.gradeSpoken,
      });
    }
  };
}

/**
 * Thin wrapper around the canonical OFFLINE-AWARE attempt writer. Loud on
 * error, and loud (once per session) when the answer went to the outbox.
 */
async function recordAttempt(
  input: {
    userId: string;
    cardId: string;
    sessionId: string | null;
    responseAudioFileId: string | null;
    result: GradeResult | null;
    scoreValue: number | null;
    score: Record<string, unknown> | null;
    transcript: string | null;
    gradedBy: string | null;
  },
  pending?: PendingGradeRequest | null,
): Promise<void> {
  const res = await recordAttemptOfflineAware(
    {
      userId: input.userId,
      itemType: FC_CARD_ITEM_TYPE,
      itemId: input.cardId,
      method: FAST_FIRE_METHOD,
      responseKind: "spoken",
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.result ? { result: input.result } : {}),
      ...(input.scoreValue !== null ? { scoreValue: input.scoreValue } : {}),
      ...(input.score ? { score: input.score } : {}),
      ...(input.responseAudioFileId
        ? { responseAudioFileId: input.responseAudioFileId }
        : {}),
      ...(input.transcript ? { responseTranscript: input.transcript } : {}),
      ...(input.gradedBy ? { gradedBy: input.gradedBy } : {}),
    },
    pending ?? null,
  );
  if (res.error) {
    console.error("[fastfire.gradeCard] recordAttempt failed:", res.error);
    return;
  }
  // A recording we were offered and could not keep is its OWN message, said
  // every time it happens rather than latched: it is rare, it is specific, and
  // folding it into the once-per-session "saved offline" toast would tell the
  // learner their answer is safe while half of it was just discarded.
  if (res.clipRejection) {
    noticeClipRejected(res.clipRejection);
  }
  if (res.queued) {
    noticeOfflineOnce(input.sessionId, res.heldForGrade);
  }
}

/** Say exactly what was lost and why. Never a generic "something went wrong". */
function noticeClipRejected(reason: ClipRejection): void {
  toast.warning(
    reason === "too-large"
      ? "That recording was too long to keep offline — the answer was saved, but it will stay ungraded."
      : reason === "budget-full"
        ? "Your offline recordings have filled the space this device allows. This answer was saved, but its recording was not — reconnect to sync and free it up."
        : "This device can't store recordings offline. The answer was saved, but it will stay ungraded.",
  );
}

/**
 * The session already told "you're offline". A 20-card drill with no connection
 * queues 20 attempts; the learner needs to hear that ONCE, not twice a second.
 * Module-level because the grade thunks are fire-and-forget and share no
 * component instance to hang a ref on — and a single slot rather than a Set,
 * because a learner runs one drill at a time and an unbounded Set of every
 * session id the tab ever saw is a leak with no reader.
 */
let lastOfflineNoticeSession: string | null = null;

function noticeOfflineOnce(sessionId: string | null, held: boolean): void {
  const key = sessionId ?? "no-session";
  if (lastOfflineNoticeSession === key) return;
  lastOfflineNoticeSession = key;
  toast.success(
    held
      ? // TRUE ONLY SINCE THE CLIP IS HELD. Before that this sentence read
        // "Grading needs a connection, so these stay ungraded" — accurate then,
        // a lie now. A toast that under-promises is not harmless: a learner told
        // their answers are ungraded has no reason to come back and look.
        "Saved offline — your recordings are kept, and they're graded as soon as you reconnect."
      : // No recording was kept for this one, so it genuinely cannot be graded.
        "Saved offline — your answers sync when you reconnect. Without a recording these stay ungraded.",
  );
}
