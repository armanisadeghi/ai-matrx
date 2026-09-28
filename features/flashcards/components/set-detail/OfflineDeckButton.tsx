"use client";

// features/flashcards/components/set-detail/OfflineDeckButton.tsx
//
// THE BUTTON. `OfflineStudyPanel` has always told the learner to "open a deck
// while you have a signal and choose Download" — this is the control that
// sentence names. One component, used on the deck page AND in the study
// header, so there is exactly one download affordance in the product rather
// than a second variant per surface.
//
// It shows STATE, not just an action: a deck already on this device says so
// (with when), offers a refresh, and offers removal. A browser that cannot
// store anything says that out loud instead of offering a button that would
// silently do nothing.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState, useTransition } from "react";
import {
  CloudDownload,
  CloudOff,
  Check,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  downloadDeckOffline,
  getOfflineDeckStatus,
  removeDeckOffline,
  type OfflineDeckStatus,
} from "../../data/offlineDeck";

/**
 * The offline-download state and actions for one deck — shared by the button
 * and by menu items (the deck page's Export menu), so both say the same thing.
 */
export function useOfflineDeck(setId: string) {
  const userId = useAppSelector(selectUserId) ?? "";
  const [status, setStatus] = useState<OfflineDeckStatus | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getOfflineDeckStatus(userId, setId).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, setId]);

  const refreshStatus = async () => {
    setStatus(await getOfflineDeckStatus(userId, setId));
  };

  const download = async (isRefresh: boolean) => {
    if (working) return;
    setWorking(true);
    try {
      const res = await downloadDeckOffline(userId, setId);
      if (!res.ok) {
        // Loud recovery: a download that silently failed is exactly how a
        // learner ends up on a train with an empty "Downloaded decks" list.
        toast.error(res.error ?? "Couldn't download this deck.");
        return;
      }
      toast.success(
        isRefresh
          ? `Download updated — ${res.cardCount} ${res.cardCount === 1 ? "card" : "cards"} ready offline.`
          : `Downloaded — study these ${res.cardCount} ${res.cardCount === 1 ? "card" : "cards"} with no connection.`,
      );
      await refreshStatus();
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    if (working) return;
    setWorking(true);
    try {
      await removeDeckOffline(userId, setId);
      toast.success("Removed from this device.");
      await refreshStatus();
    } finally {
      setWorking(false);
    }
  };

  return { status, working, download, remove };
}

/** The same control as menu items, for a DropdownMenuContent. */
export function OfflineDeckMenuItems({
  setId,
  disabled = false,
}: {
  setId: string;
  disabled?: boolean;
}) {
  const { status, working, download, remove } = useOfflineDeck(setId);
  if (status && !status.available) {
    return (
      <DropdownMenuItem disabled className="gap-2">
        <CloudOff className="h-4 w-4 text-muted-foreground" />
        Offline unavailable in this browser
      </DropdownMenuItem>
    );
  }
  if (status?.downloaded) {
    return (
      <>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          On this device since{" "}
          {status.cachedAt ? new Date(status.cachedAt).toLocaleDateString() : "recently"}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2"
          disabled={working}
          onClick={() => void download(true)}
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          Update offline download
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={working}
          onClick={() => void remove()}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          Remove from this device
        </DropdownMenuItem>
      </>
    );
  }
  return (
    <DropdownMenuItem
      className="gap-2"
      disabled={disabled || working}
      onClick={() => void download(false)}
    >
      {working ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CloudDownload className="h-4 w-4 text-muted-foreground" />
      )}
      Download for offline
    </DropdownMenuItem>
  );
}

export function OfflineDeckButton({
  setId,
  disabled = false,
  size = "default",
  className,
}: {
  setId: string;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
}) {
  const { status, working, download, remove } = useOfflineDeck(setId);
  const [busy, startBusy] = useTransition();
  // Unknown yet — render the un-downloaded shape rather than a flicker of
  // "Downloaded" that turns out to be wrong.
  const known = status != null;

  if (known && !status.available) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled
        className={className}
        title="This browser can't store decks offline (private browsing, or no storage space)."
      >
        <CloudOff className="mr-1.5 h-4 w-4" />
        Offline unavailable
      </Button>
    );
  }

  if (known && status.downloaded) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={size}
            disabled={disabled || busy}
            className={cn(
              "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
              className,
            )}
          >
            {working ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            Downloaded
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            On this device since{" "}
            {status.cachedAt
              ? new Date(status.cachedAt).toLocaleDateString()
              : "recently"}
            . Studies with no connection; answers sync when you reconnect.
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => startBusy(() => void download(true))}
            disabled={working}
          >
            <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" />
            Update download
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => startBusy(() => void remove())}
            disabled={working}
          >
            <Trash2 className="mr-2 h-4 w-4 text-muted-foreground" />
            Remove from device
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      variant="outline"
      size={size}
      disabled={disabled || working}
      className={className}
      onClick={() => void download(false)}
      title="Keep this deck on this device so you can study it with no connection"
    >
      {working ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <CloudDownload className="mr-1.5 h-4 w-4" />
      )}
      Download
    </Button>
  );
}
