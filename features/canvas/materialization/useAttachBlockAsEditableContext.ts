"use client";

/**
 * useAttachBlockAsEditableContext — React hook wrapping
 * `attachBlockAsEditableContext` for CodeBlock / JsonBlock menus.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  attachBlockAsEditableContext,
  type AttachBlockInput,
  type AttachBlockResult,
} from "@/features/canvas/materialization/attachBlockAsEditableContext";
import { isRealSourceId } from "@/features/canvas/materialization/materializeBlocks";

export function useAttachBlockAsEditableContext(args: {
  conversationId?: string | null;
  messageId?: string | null;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [busy, setBusy] = useState(false);

  const canAttach =
    Boolean(args.conversationId) &&
    isRealSourceId(args.messageId ?? null) &&
    !busy;

  async function attach(input: {
    content: string;
    language: string;
    title?: string;
    existingArtifactId?: string | null;
  }): Promise<AttachBlockResult | null> {
    if (!args.conversationId || !isRealSourceId(args.messageId ?? null)) {
      toast.error("Wait for the message to finish saving, then try again");
      return null;
    }
    if (busy) return null;
    setBusy(true);
    try {
      const payload: AttachBlockInput = {
        conversationId: args.conversationId,
        messageId: args.messageId!,
        content: input.content,
        language: input.language,
        title: input.title,
        existingArtifactId: input.existingArtifactId,
      };
      const result = await attachBlockAsEditableContext(payload, {
        dispatch,
        getState: () => store.getState(),
      });
      if (!result.ok) {
        toast.error(
          result.errors[0] ?? "Could not add to conversation context",
        );
        return result;
      }
      toast.success(
        result.alreadyAttached
          ? "Already in conversation context — refreshed"
          : "Added to conversation context (editable)",
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { attach, busy, canAttach };
}
