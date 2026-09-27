"use client";

/**
 * THE SERVER-SAFE RETRY. A server page cannot hand a failure notice a retry
 * function — functions do not cross the server/client boundary — so its
 * "Couldn't load …" card had no way forward but the browser's own reload
 * (page-pass 2026-09-27, /chat/message-templates/<id>). This control is the
 * retry any server-rendered failure can carry: it takes no props a server
 * cannot send, and it reloads THIS url (path, query and hash), which re-runs the
 * server read that failed.
 *
 * Its words say what it does — "Reload page" — because a reload also drops
 * anything unsaved elsewhere on the page; a client surface that can retry just
 * its own read passes `onRetry` to `ReadFailure` instead.
 */
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const RELOAD_PAGE_LABEL = "Reload page";

export function ReloadPageButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? "h-7 gap-1.5 text-xs"}
      onClick={() => window.location.reload()}
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {RELOAD_PAGE_LABEL}
    </Button>
  );
}
