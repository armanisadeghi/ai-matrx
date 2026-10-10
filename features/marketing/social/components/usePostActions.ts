"use client";

/**
 * The one set of post actions (get transcript, breakdown, save to swipe file): a post's buttons and
 * the agent's client tools run THESE, on a board tile and on the Socials post page / panel alike.
 */

import { useState } from "react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { useInvalidateSocial } from "../hooks";
import { addToCollection, analyzePost, createCollection, getTranscript, socialErrorCode, socialErrorMessage } from "../server";

/** The one set of post actions: the buttons and the agent's client tools run THESE. */
export function usePostActions(args: { postId: string; organizationId: string; hasTranscript: boolean; openDetail: () => void }) {
  const { postId, organizationId } = args;
  const invalidate = useInvalidateSocial();
  const [busy, setBusy] = useState<string | null>(null);
  const [breakdownNote, setBreakdownNote] = useState<string | null>(null);

  async function transcript(): Promise<string> {
    if (args.hasTranscript) return "This post already has a transcript.";
    const ok = await confirm({
      title: "Get the transcript?",
      description: "Gets the transcript once, or transcribes the stored video. Uses part of your plan.",
      confirmLabel: "Get transcript",
    });
    if (!ok) return "The person declined; nothing was spent.";
    setBusy("transcript");
    try {
      const outcome = await getTranscript(postId, { organizationId });
      await invalidate();
      return outcome.status === "available"
        ? `Transcript stored (${outcome.word_count ?? "?"} words).`
        : `No transcript could be made. ${outcome.notes.join(" ")}`.trim();
    } catch (e) {
      throw new Error(socialErrorMessage(e, "Could not get the transcript."));
    } finally {
      setBusy(null);
    }
  }

  async function breakdown(): Promise<string> {
    setBusy("breakdown");
    try {
      const result = await analyzePost(postId, { organizationId });
      setBreakdownNote(null);
      await invalidate();
      return result.summary ?? `Breakdown ${result.status}.`;
    } catch (e) {
      if (socialErrorCode(e) === "social_agent_not_built") {
        const note = "The breakdown agent is not built yet.";
        setBreakdownNote(note);
        return note;
      }
      throw new Error(socialErrorMessage(e, "Could not run the breakdown."));
    } finally {
      setBusy(null);
    }
  }

  async function saveToSwipe(): Promise<string> {
    setBusy("save");
    try {
      const existing = await import("@/features/marketing/social/service").then((m) => m.readSwipeCollections({ organizationId }));
      const id = existing[0]?.id ?? (await createCollection({ name: "Saved" }, { organizationId })).collection_id;
      await addToCollection(id, { itemType: "social_post", itemId: postId }, { organizationId });
      await invalidate();
      return "Saved to the swipe file.";
    } catch (e) {
      throw new Error(socialErrorMessage(e, "Could not save to the swipe file."));
    } finally {
      setBusy(null);
    }
  }

  return { busy, breakdownNote, transcript, breakdown, saveToSwipe, openDetail: args.openDetail };
}

