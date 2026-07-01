"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Slim action bar for a canonicalization page — Reload + page-specific
 * actions only. Deliberately has no title/icon/description: the tab bar
 * above (CanonicalizationLayoutClient) already shows which page is active,
 * so repeating that as a heading is pure ceremony that steals vertical
 * space on a data-dense admin screen. Renders nothing when there's nothing
 * to show.
 */
export function CanonicalizationToolbar({
  onReload,
  reloading,
  actions,
}: {
  onReload?: () => void;
  reloading?: boolean;
  actions?: ReactNode;
}) {
  if (!onReload && !actions) return null;
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-1.5">
      {actions}
      {onReload ? (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onReload} disabled={reloading}>
          {reloading ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3 w-3" />
          )}
          Reload
        </Button>
      ) : null}
    </div>
  );
}
