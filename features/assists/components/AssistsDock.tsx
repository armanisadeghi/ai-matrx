"use client";

/**
 * AssistsDock — the global, always-available stack of my pending assists.
 *
 * Mounted once in DeferredSingletonCore. Quiet by design: nothing renders
 * at count 0; at count > 0 a compact launcher pill sits bottom-right
 * (above the window tray) and expands into a card stack. Fetches once per
 * session + on window focus — no realtime channel (deliberate: assists are
 * ambient, not urgent; the supabase-realtime doctrine says don't subscribe
 * without need).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Lightbulb } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  fetchMyAssists,
  selectAssistsLoaded,
  selectPendingAssists,
} from "../redux/assistsSlice";
import { AssistChip } from "./AssistChip";
import { ASSISTS_MANAGER_HREF, partitionByConfidence } from "../constants";

const MAX_VISIBLE = 6;

export default function AssistsDock() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const pending = useAppSelector(selectPendingAssists);
  const loaded = useAppSelector(selectAssistsLoaded);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!loaded) {
      void dispatch(fetchMyAssists({ userId }));
    }
    const onFocus = () => void dispatch(fetchMyAssists({ userId }));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [dispatch, userId, loaded]);

  if (!userId || pending.length === 0) return null;

  const { strong, weak } = partitionByConfidence(pending);
  const visible = strong.slice(0, MAX_VISIBLE);
  const overflow = strong.length - visible.length + weak.length;

  return (
    <div className="fixed bottom-14 right-3 z-40 flex flex-col items-end gap-1.5 pb-safe">
      {open && (
        <div className="flex max-h-[50dvh] w-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur">
          {visible.map((assist) => (
            <AssistChip key={assist.id} assist={assist} className="w-full" />
          ))}
          {/* A count is a door (THE DOOR LAW) — "+N more" now reaches them. */}
          <Link
            href={ASSISTS_MANAGER_HREF}
            className="px-2 py-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {overflow > 0 ? `+${overflow} more — ` : ""}Open all assists
          </Link>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-md hover:bg-accent"
        aria-label={open ? "Collapse assists" : "Show assists"}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
        )}
        {pending.length} assist{pending.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
