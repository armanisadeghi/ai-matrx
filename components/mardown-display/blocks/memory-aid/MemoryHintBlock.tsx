"use client";

/**
 * MemoryHintBlock — THE renderer for the `memory_hint` kind. There is no
 * other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * One glanceable per-flashcard memory aid: a technique pill, the aid, and a
 * one-line explanation. Renders identically in the live run window, in chat,
 * and inline under the flashcard's memory-aid button (`MemoryAidButton`,
 * which used to hand-roll this exact card — that JSX is deleted).
 *
 * Streaming-tolerant: until the `aid` text has parsed there is nothing
 * glanceable to show, so the block renders a small writing row — never raw
 * JSON.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/memory-aid.ts`; also accepts a raw hint payload
 * (`fc_detail`-reconstructed or persisted) — `readMemoryHintData` recognizes
 * both.
 */

import { Loader2 } from "lucide-react";
import {
  coerceMemoryHint,
  type MemoryHintData,
} from "@/features/content-ir/kinds/memory-aid";
import { cn } from "@/lib/utils";
import { TechniquePill } from "./MemoryAidBlock";

/**
 * Accepts either the streaming bridge output ({ hint, isComplete }) or a raw
 * hint payload value.
 */
export function readMemoryHintData(serverData: unknown): MemoryHintData {
  if (
    typeof serverData === "object" &&
    serverData !== null &&
    "hint" in serverData
  ) {
    const data = serverData as { hint?: unknown; isComplete?: unknown };
    return {
      hint: coerceMemoryHint(data.hint),
      isComplete: data.isComplete !== false,
    };
  }
  return { hint: coerceMemoryHint(serverData), isComplete: true };
}

export interface MemoryHintBlockProps {
  serverData?: unknown;
  className?: string;
}

export default function MemoryHintBlock({
  serverData,
  className,
}: MemoryHintBlockProps) {
  const { hint, isComplete } = readMemoryHintData(serverData);

  if (!hint) {
    if (isComplete) return null;
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Finding you a memory aid…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm",
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <TechniquePill technique={hint.technique} />
      </div>
      <p className="font-medium text-foreground">{hint.aid}</p>
      {hint.explanation && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hint.explanation}
        </p>
      )}
    </div>
  );
}
