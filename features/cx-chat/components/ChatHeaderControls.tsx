"use client";

// ChatHeaderControls — Desktop header controls for the SSR chat route.
//
// Self-contained client island — reads all state from Redux.
// Injects via PageHeaderPortal into #shell-header-center on desktop (lg+).
// On mobile, this component renders nothing (the mobile bar is separate).
//
// Features:
//   - Admin-only: localhost toggle + block mode toggle
//   - Share button when in a conversation

import { useState } from "react";
import { Share2, Blocks, Camera } from "lucide-react";
import dynamic from "next/dynamic";
import PageHeaderPortal from "@/features/shell/components/header/PageHeaderPortal";
import IconButton from "@/features/shell/components/IconButton";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectIsSuperAdmin,
} from "@/lib/redux/slices/userSlice";
import {
  selectIsBlockMode,
  selectIsSnapshot,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setUseBlockMode,
  setUseSnapshot,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { usePathname, useSearchParams } from "next/navigation";
import { ContextGaugeWidget } from "./ContextGaugeWidget";
import SandboxAttachControl from "./SandboxAttachControl";

const ShareModal = dynamic(
  () => import("@/features/sharing").then((m) => ({ default: m.ShareModal })),
  { ssr: false },
);

export default function ChatHeaderControls() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsSuperAdmin);

  const blockMode = useAppSelector(selectIsBlockMode);
  const snapshot = useAppSelector(selectIsSnapshot);

  // Derive conversationId from URL — header only needs it for the share button.
  const conversationId = (() => {
    const pathMatch = pathname.match(/\/ssr\/chat\/c\/([^/?]+)/);
    return pathMatch?.[1] ?? searchParams.get("conversation") ?? null;
  })();

  const [isShareOpen, setIsShareOpen] = useState(false);

  const showShare = isAuthenticated && !!conversationId;
  // Gauge renders for any authenticated user inside a conversation —
  // not gated behind admin like the block/snapshot toggles. The widget
  // self-hides until the slice has a real measurement.
  const showGauge = isAuthenticated && !!conversationId;
  // The sandbox attach control sets the user's SHARED active box, so it shows
  // for any authenticated user — even outside a conversation. Inside a
  // conversation it also offers the per-conversation override.
  const showSandbox = isAuthenticated;
  if (!showShare && !isAdmin && !showGauge && !showSandbox) return null;

  return (
    <>
      <PageHeaderPortal>
        <div className="hidden lg:flex items-center justify-end w-full gap-1">
          {showGauge && conversationId && (
            <ContextGaugeWidget conversationId={conversationId} />
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => dispatch(setUseBlockMode(!blockMode))}
                title={
                  blockMode
                    ? "Block mode ON — click to disable."
                    : "Block mode OFF — click to enable."
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
                onClick={() => dispatch(setUseSnapshot(!snapshot))}
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
            </>
          )}

          {showSandbox && (
            <SandboxAttachControl conversationId={conversationId} />
          )}

          {showShare && (
            <IconButton
              icon={<Share2 />}
              onClick={() => setIsShareOpen(true)}
              label="Share conversation"
            />
          )}
        </div>
      </PageHeaderPortal>

      {isShareOpen && conversationId && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          resourceType="cx_conversation"
          resourceId={conversationId}
          resourceName="Chat"
          isOwner={true}
        />
      )}
    </>
  );
}
