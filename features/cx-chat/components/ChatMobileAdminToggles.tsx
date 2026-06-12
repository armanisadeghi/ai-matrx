"use client";

// ChatMobileAdminToggles — Admin-only client island for the mobile header.
//
// Migrated to pure Redux: no context dependencies.

import { Blocks, Camera } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectActiveServer,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  selectIsBlockMode,
  selectIsSnapshot,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setUseBlockMode,
  setUseSnapshot,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

export default function ChatMobileAdminToggles() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const activeServer = useAppSelector(selectActiveServer);
  const isUsingLocalhost = activeServer === "localhost";
  const blockMode = useAppSelector(selectIsBlockMode);
  const snapshot = useAppSelector(selectIsSnapshot);

  if (!isAdmin) return null;

  const handleToggleLocalhost = () => {
    dispatch(
      switchServer({ env: isUsingLocalhost ? "production" : "localhost" }),
    );
  };

  const handleToggleBlockMode = () => {
    dispatch(setUseBlockMode(!blockMode));
  };

  const handleToggleSnapshot = () => {
    dispatch(setUseSnapshot(!snapshot));
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleToggleLocalhost}
        title={
          isUsingLocalhost
            ? "Using localhost — click to switch to production"
            : "Using production — click to switch to localhost"
        }
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
          isUsingLocalhost
            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
            : "text-muted-foreground/50 hover:text-muted-foreground border border-transparent hover:border-border"
        }`}
      >
        local
      </button>
      <button
        onClick={handleToggleBlockMode}
        title={
          blockMode
            ? "Block mode ON — using agents-blocks endpoint. Click to disable."
            : "Block mode OFF — using standard agents endpoint. Click to enable."
        }
        className={`p-1.5 rounded-md transition-colors ${
          blockMode
            ? "text-violet-600 dark:text-violet-400 bg-violet-500/15 border border-violet-500/30"
            : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50 border border-transparent"
        }`}
      >
        <Blocks className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleToggleSnapshot}
        title={
          snapshot
            ? "Snapshot ON — every request stamps snapshot:true. Click to disable."
            : "Snapshot OFF — click to capture full server-side snapshots per request."
        }
        className={`p-1.5 rounded-md transition-colors ${
          snapshot
            ? "text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/15 border border-fuchsia-500/30"
            : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50 border border-transparent"
        }`}
      >
        <Camera className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
