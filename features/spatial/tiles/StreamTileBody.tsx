"use client";

/**
 * StreamTileBody — a live stream inside a tile, paced by zoom.
 *
 * Renders through the ONE pipeline: every block goes to `BlockRenderer`
 * (the renderer chat, run pages and DB reloads use), so a kind renders as its
 * registered component and prose as markdown. This file adds only the pacing
 * and the landing motion:
 *   - read tier: commits per animation frame — token-level motion.
 *   - batched tiers: each commit lands with a short settle (opacity + blur
 *     clearing) and a smooth follow-scroll, both a bit shorter than the batch
 *     interval, so discrete commits read as one continuous flow.
 * The follow-scroll yields the moment the person scrolls up to read, and
 * resumes when they return to the bottom.
 */

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { PaceTier } from "../engine/lod";
import type { PacedSource } from "../streams/stream-source";
import { usePacedSnapshot } from "../streams/usePacedSnapshot";

const BlockRenderer = dynamic(
  () =>
    import("@/components/mardown-display/chat-markdown/block-registry/BlockRenderer").then(
      (m) => m.BlockRenderer,
    ),
  { ssr: false, loading: () => null },
);

const noop = () => {};

export function StreamTileBody({
  source,
  tier,
  emptyLabel = "Waiting for the first words…",
}: {
  source: PacedSource;
  tier: PaceTier;
  emptyLabel?: string;
}) {
  const { snapshot, seq, revealMs } = usePacedSnapshot(source, tier);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  // Land each batched commit: settle the body and glide to the new tail.
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content || seq === 0) return;
    if (following.current) {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: revealMs > 0 ? "smooth" : "auto",
      });
    }
    if (revealMs > 0 && typeof content.animate === "function") {
      content.animate(
        [
          { opacity: 0.72, filter: "blur(0.8px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: revealMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
  }, [seq, revealMs]);

  const streaming = snapshot.phase === "streaming";

  return (
    <div
      ref={scrollRef}
      data-spatial-scroll
      onScroll={(e) => {
        const el = e.currentTarget;
        following.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
      }}
      className="h-full overflow-y-auto overscroll-contain px-4 py-3"
    >
      <div ref={contentRef} className="text-sm">
        {snapshot.blocks.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {snapshot.phase === "idle" ? "Not started" : emptyLabel}
          </p>
        ) : (
          snapshot.blocks.map((block, index) => (
            <BlockRenderer
              key={block.blockId}
              block={{
                type: block.type,
                content: block.content ?? "",
                serverData: block.data ?? undefined,
                metadata: block.metadata,
                isStreamingBlock: block.status === "streaming",
              }}
              index={index}
              isStreamActive={streaming}
              replaceBlockContent={noop}
              handleOpenEditor={noop}
            />
          ))
        )}
        {snapshot.error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            This run failed: {snapshot.error}
          </p>
        )}
      </div>
    </div>
  );
}
