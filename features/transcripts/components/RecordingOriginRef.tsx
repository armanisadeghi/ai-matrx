"use client";

// features/transcripts/components/RecordingOriginRef.tsx
//
// THE DOOR BACK. A recording made by dictating into a surface carries an
// origin (`features/audio/recordingOrigin.ts`); this renders it as real doors —
// the record it belongs to, and the conversation it was spoken into.
//
// Generic on purpose: it reads ONLY the `RecordingOrigin` shape, so every
// surface that ever declares an origin gets its door here for free. There is
// nothing Masterwork-specific in it.
//
// Reused, not rebuilt: `EntityRef` is the canonical door to another record —
// the registry owns the route, so this component never invents one.

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { RecordingOrigin } from "@/features/audio/recordingOrigin";

export function RecordingOriginRef({
  origin,
  className,
}: {
  origin: RecordingOrigin | null | undefined;
  className?: string;
}) {
  if (!origin) return null;
  const hasEntity = Boolean(origin.entityToken && origin.entityId);
  if (!hasEntity && !origin.conversationId) return null;

  return (
    <div
      className={
        className ??
        "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      }
    >
      <span>You dictated this into</span>
      {hasEntity ? (
        <EntityRef
          token={origin.entityToken as string}
          id={origin.entityId as string}
          name={origin.label ?? null}
          href={origin.href}
          openInNewTab
        />
      ) : (
        <span className="text-foreground">{origin.label ?? origin.surface}</span>
      )}
      {origin.conversationId ? (
        <Link
          href={`/chat/${origin.conversationId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <MessagesSquare className="h-3 w-3" aria-hidden />
          the conversation
        </Link>
      ) : null}
    </div>
  );
}
