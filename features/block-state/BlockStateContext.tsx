"use client";

// features/block-state/BlockStateContext.tsx
//
// The host (BlockRenderer for chat answers, ArtifactRender for canvas items)
// builds the target ONCE and every interactive kind reads it through
// `useBlockState()` — a kind never plumbs ids itself.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { durableRecordId } from "@ai-matrx/kit/ids";
import { blockKeyFor, fingerprintOf } from "./blockKey";
import { blockNoticeKey, blockRowKey, type BlockStateScope, type BlockStateTarget } from "./types";
import { BlockStateNotice } from "./BlockStateNotice";

export const BlockStateContext = createContext<BlockStateTarget | null>(null);

export function useBlockStateTarget(): BlockStateTarget | null {
  return useContext(BlockStateContext);
}

export interface BlockStateHostProps {
  kind: string;
  /** Chat answer the block lives in (transcript key or database id). */
  messageId?: string | null;
  conversationId?: string | null;
  blockIndex?: number | null;
  /** A materialized canvas item's id — the record that holds the block off-chat. */
  canvasItemId?: string | null;
  /** The block's own declared id (a questionnaire's `id`), when its payload has one. */
  declaredId?: string | null;
  /** What the block renders — fingerprinted for identity. Pass undefined while streaming. */
  content?: unknown;
  /** True while the block is still streaming: identity is not stable yet, writes buffer. */
  streaming?: boolean;
  scope?: BlockStateScope;
  children: ReactNode;
}

/**
 * Provides the block's target and shows the honest save notice. Chat answers
 * are keyed on the answer's database id (`message`); everything else on the
 * canvas item (`canvas_item`, key `root`).
 */
export function BlockStateHost({
  kind,
  messageId,
  conversationId,
  blockIndex,
  canvasItemId,
  declaredId,
  content,
  streaming,
  scope = "viewer",
  children,
}: BlockStateHostProps) {
  const fingerprint = useMemo(() => (streaming ? null : fingerprintOf(content)), [content, streaming]);
  const durableMessage = durableRecordId(messageId) ?? null;
  const onChat = !!messageId && !!conversationId;

  const target = useMemo<BlockStateTarget>(() => {
    // A materialized canvas item holds its own state; a chat answer's inline block is held by the answer.
    if (canvasItemId) {
      return {
        entityType: "canvas_item",
        entityId: canvasItemId,
        blockKey: "root",
        kind,
        fingerprint,
        scope,
        conversationId: conversationId ?? null,
        messageId: messageId ?? null,
        blockIndex: blockIndex ?? null,
      };
    }
    return {
      entityType: "message",
      entityId: onChat ? durableMessage : null,
      blockKey: !onChat || streaming ? null : blockKeyFor({ kind, declaredId, fingerprint, ordinal: blockIndex ?? null }),
      kind,
      fingerprint,
      scope,
      conversationId: onChat ? (conversationId ?? null) : null,
      messageId: messageId ?? null,
      blockIndex: blockIndex ?? null,
    };
  }, [onChat, durableMessage, streaming, kind, declaredId, fingerprint, blockIndex, scope, conversationId, messageId, canvasItemId]);

  const rowKey =
    target.entityId && target.blockKey
      ? blockRowKey(target.entityType, target.entityId, target.blockKey, target.scope)
      : null;

  return (
    <BlockStateContext.Provider value={target}>
      {children}
      <BlockStateNotice rowKey={blockNoticeKey(rowKey, target)} />
    </BlockStateContext.Provider>
  );
}
