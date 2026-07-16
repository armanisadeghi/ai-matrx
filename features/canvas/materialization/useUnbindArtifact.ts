"use client";

/**
 * useUnbindArtifact — React hook behind the "Detach as text" chrome on a
 * materialized artifact ref (ArtifactBlock header).
 *
 * Source resolution:
 *  - An enclosing `UnbindSurfaceContext` provider (notes, other non-chat
 *    surfaces) wins — its getContent/persistRewrite are the surface's
 *    canonical paths.
 *  - Otherwise chat: content from the messages slice, rewrite via
 *    `cxMessageContentRewriter` (cx_message_set_content — archives the prior
 *    body to content_history), then `flipMessageToDbRender` so the ref
 *    disappears in-session.
 *
 * Semantics live in `unbindArtifact.ts` (row kept, inertness-gated, latest
 * chain version). This hook only wires surfaces + toasts.
 */

import { useContext, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { isRealSourceId, type PersistRewrite } from "./materializeBlocks";
import { cxMessageContentRewriter } from "./materializeMessageArtifacts";
import { flipMessageToDbRender } from "./flipMessageToDbRender";
import { unbindArtifact } from "./unbindArtifact";
import { UnbindSurfaceContext } from "./UnbindSurfaceContext";

export interface UseUnbindArtifactArgs {
  artifactId?: string | null;
  /** Chat source (ignored when an UnbindSurfaceContext provider is mounted). */
  messageId?: string | null;
  conversationId?: string | null;
}

export function useUnbindArtifact(args: UseUnbindArtifactArgs) {
  const surface = useContext(UnbindSurfaceContext);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [busy, setBusy] = useState(false);

  const artifactId = isMaterializedArtifactId(args.artifactId)
    ? args.artifactId
    : null;
  const hasChatSource = Boolean(
    args.conversationId && isRealSourceId(args.messageId ?? null),
  );
  const canUnbind = Boolean(artifactId && (surface || hasChatSource)) && !busy;
  const surfaceNoun = surface?.surfaceNoun ?? "message";

  async function unbind(): Promise<boolean> {
    if (!artifactId) return false;
    if (busy) return false;
    setBusy(true);
    try {
      let content: CxContentBlock[] | null = null;
      let persistRewrite: PersistRewrite | null = null;

      if (surface) {
        content = surface.getContent();
        persistRewrite = surface.persistRewrite;
      } else if (hasChatSource) {
        const record =
          store.getState().messages?.byConversationId?.[args.conversationId!]
            ?.byId?.[args.messageId!];
        content = (record?.content ?? null) as CxContentBlock[] | null;
        persistRewrite = cxMessageContentRewriter(args.messageId!);
      }

      if (!content || !Array.isArray(content) || !persistRewrite) {
        toast.error("Couldn't read the source content to detach from");
        return false;
      }

      const result = await unbindArtifact({
        artifactId,
        content,
        persistRewrite,
      });

      if (!result.ok) {
        const message =
          result.reason === "not_inert"
            ? "This artifact type can't detach yet — it would re-convert on reload. Use Copy as Markdown instead."
            : result.reason === "ref_not_found"
              ? `Couldn't find this artifact's reference in the ${surfaceNoun}`
              : result.reason === "row_not_found"
                ? "The saved artifact no longer exists"
                : (result.errors[0] ?? "Detach failed");
        toast.error(message);
        return false;
      }

      // Chat: flip the in-session render off the stream anchor so the ref
      // disappears immediately. Non-chat surfaces update their own store
      // inside persistRewrite.
      if (!surface && hasChatSource) {
        await flipMessageToDbRender(
          {
            conversationId: args.conversationId!,
            messageId: args.messageId!,
          },
          { dispatch, getState: () => store.getState() },
        );
      }

      toast.success(
        "Detached as text — the saved artifact stays in your canvas library",
      );
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { canUnbind, busy, unbind, surfaceNoun };
}
