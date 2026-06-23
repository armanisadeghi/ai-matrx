"use client";

// app/(ssr)/demos/chat/_components/ChatConversationSkeleton.tsx
//
// A lightweight skeleton that mimics the ConversationShell layout.
// Shown instantly when the URL contains a conversation ID, preventing
// the welcome screen flash while the real conversation loads.

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton shown while ConversationShell dynamic import loads.
 * Mimics the ConversationShell layout (messages + input bar).
 */
export function ConversationShellSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-textured w-full">
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          <div className="max-w-[800px] mx-auto w-full px-4 pt-6 space-y-6">
            <div className="flex justify-end">
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex justify-start">
              <div className="space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 p-2 pb-safe">
        <div className="max-w-[800px] mx-auto">
          <div className="flex items-center gap-0 border border-border rounded-3xl py-2 bg-background">
            <div className="flex-1 py-[9px] px-3">
              <Skeleton className="h-[18px] w-32" />
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-600/40 mr-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-page skeleton shown by Suspense fallback on conversation route.
 */
export function ChatConversationSkeleton() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* ── Message area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="max-w-[800px] mx-auto w-full px-4 pt-6 space-y-6">
          {/* User message bubble */}
          <div className="flex justify-end">
            <div className="max-w-[75%] space-y-2">
              <Skeleton className="h-4 w-48 ml-auto" />
              <Skeleton className="h-4 w-32 ml-auto" />
            </div>
          </div>

          {/* Assistant message bubble */}
          <div className="flex justify-start">
            <div className="max-w-[75%] space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>

          {/* Second user message */}
          <div className="flex justify-end">
            <div className="max-w-[75%] space-y-2">
              <Skeleton className="h-4 w-36 ml-auto" />
            </div>
          </div>

          {/* Second assistant message */}
          <div className="flex justify-start">
            <div className="max-w-[75%] space-y-2">
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Input bar skeleton ──────────────────────────────────────── */}
      <div className="flex-shrink-0 p-2 pb-safe">
        <div className="max-w-[800px] mx-auto">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
