"use client";

/**
 * Feed an accumulating text stream (an agent's answer text from Redux, a
 * websocket buffer, anything that grows monotonically) into a live
 * ParseSession and read the typed tree as it forms.
 *
 * ⛔ INTERNAL TO content-ir — NOT a primitive features may consume.
 *
 * This is NOT the "watch structured output form in real time" primitive it was
 * once documented as. Streamed model output renders through the ONE canonical
 * pipeline (`MarkdownStream` → `EnhancedChatMarkdown` → `BlockRenderer` → the
 * kind registry); a surface that opens its own parse session is a BESPOKE
 * STREAM RENDERER and is banned — see `features/content-ir/FEATURE.md`
 * § No bespoke stream renderers and the matching rule in CLAUDE.md.
 *
 * Rendering a stream outside `/chat`? Give it a `requestId` through the
 * execution system and read `selectKindEnvelope`. Blocked? Ask Arman. Adding a
 * caller here is not the answer, however small the surface — that argument is
 * exactly what produced the two quarantined callers below.
 *
 * Existing callers, both debt awaiting removal, neither a precedent:
 * `features/marketing/seo/keyword-research/components/LiveResearchFeed.tsx`,
 * `features/flashcards/components/create/CreateFromTopic.tsx` (fallback beside
 * the correct Redux-primary read).
 *
 * Prose before the first `{` is skipped; anything after the root object
 * closes is ignored by the parser — defensive against answers that aren't
 * perfectly pure JSON.
 */

import { useEffect, useRef } from "react";
import {
  disposeParseSession,
  getParseSession,
  openParseSession,
} from "../session/session-manager";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { useIrNode } from "./useIrNode";
import type { IrTreeNode } from "../core/ir-tree";
import type { CanonicalBlockIR } from "../core/ir-types";

export interface UseLiveJsonRegionOptions {
  /** Known-context root prediction (e.g. "flashcard_set" for the cards agent). */
  expectedRootKind?: string;
  /** True once the source stream has finished — ends the region. */
  done?: boolean;
}

export interface LiveJsonRegion {
  /** The root kind node — identity bumps on every tree change (COW spine). */
  rootNode: IrTreeNode | null;
  /** Current canonical envelope, or null before the region opens. */
  envelope: CanonicalBlockIR | null;
}

export function useLiveJsonRegion(
  identity: string | null,
  text: string | null | undefined,
  options?: UseLiveJsonRegionOptions,
): LiveJsonRegion {
  const openedRef = useRef<string | null>(null);
  const fedLenRef = useRef(0);
  const startedRef = useRef(false);
  const expectedRootKind = options?.expectedRootKind;
  const done = options?.done ?? false;

  useEffect(() => {
    if (!identity) return;

    if (openedRef.current !== identity) {
      if (openedRef.current) disposeParseSession(openedRef.current);
      openedRef.current = identity;
      fedLenRef.current = 0;
      startedRef.current = false;
      void kindRegistry.ensureWarm();
      void componentRegistry.ensureWarm();
      try {
        openParseSession({
          identity,
          schemas: kindRegistry.resolver(),
          expectedRootKind,
          onSchemaArrived: (deliver) => kindRegistry.onSchemaArrived(deliver),
        });
      } catch {
        // A writer already exists for this identity (fast remount) — this
        // hook instance becomes a reader; feeding is the writer's job.
        return;
      }
    }

    const session = getParseSession(identity);
    if (!session) return;
    if (session.isEnded) return;

    const full = text ?? "";

    if (!startedRef.current) {
      const openIndex = full.indexOf("{");
      if (openIndex === -1) {
        return; // nothing structured yet
      }
      fedLenRef.current = openIndex;
      startedRef.current = true;
    }

    if (full.length > fedLenRef.current) {
      session.write(full.slice(fedLenRef.current));
      fedLenRef.current = full.length;
      session.flushNotify();
    }

    if (done) {
      session.end();
      session.flushNotify();
    }
  }, [identity, text, done, expectedRootKind]);

  // Dispose the session when the consumer goes away for good.
  useEffect(() => {
    return () => {
      if (openedRef.current) {
        disposeParseSession(openedRef.current);
        openedRef.current = null;
      }
    };
  }, []);

  const rootNode = useIrNode(identity, "");
  const envelope =
    identity && rootNode
      ? (getParseSession(identity)?.buildEnvelope() ?? null)
      : null;

  return { rootNode, envelope };
}
