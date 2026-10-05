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
import { ShareModal } from "../../host/ui-slots";
import { IconButton, PageHeaderPortal } from "../../host/chrome";
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import { selectIsSuperAdminDebugger } from "../../host/prefs";
import {
  selectIsBlockMode,
  selectIsSnapshot,
} from "../../agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setUseBlockMode,
  setUseSnapshot,
} from "../../agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { usePathname, useSearchParams } from "../../host/navigation";
import { ContextGaugeWidget } from "./ContextGaugeWidget";
import { ConversationPageMenu } from "../../agents/components/chat/ConversationPageMenu";
import { selectIsAuthenticated } from "../../host/identity";
import { Button } from "@ai-matrx/design-system/controls";

export default function ChatHeaderControls() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsSuperAdminDebugger);

  const blockMode = useAppSelector(selectIsBlockMode);
  const snapshot = useAppSelector(selectIsSnapshot);

  // Derive conversationId from URL — header only needs it for the share button.
  const conversationId = (() => {
    const pathMatch = pathname.match(/\/demos\/chat\/c\/([^/?]+)/);
    return pathMatch?.[1] ?? searchParams.get("conversation") ?? null;
  })();

  const [isShareOpen, setIsShareOpen] = useState(false);

  const showShare = isAuthenticated && !!conversationId;
  // Gauge renders for any authenticated user inside a conversation —
  // not gated behind admin like the block/snapshot toggles. The widget
  // self-hides until the slice has a real measurement.
  const showGauge = isAuthenticated && !!conversationId;
  if (!showShare && !isAdmin && !showGauge) return null;

  return (
    <>
      <PageHeaderPortal>
        <div className="hidden lg:flex items-center justify-end w-full gap-1">
          {showGauge && conversationId && (
            <ContextGaugeWidget conversationId={conversationId} />
          )}
          {isAdmin && (
            <>
              <Button variant="quiet" pressed={!!(blockMode)} icon={<Blocks />} onClick={() => dispatch(setUseBlockMode(!blockMode))} title={
                  blockMode
                    ? "Block mode ON — click to disable."
                    : "Block mode OFF — click to enable."
                } aria-label={
                  blockMode
                    ? "Block mode ON — click to disable."
                    : "Block mode OFF — click to enable."
                } />
              <Button variant="quiet" pressed={!!(snapshot)} icon={<Camera />} onClick={() => dispatch(setUseSnapshot(!snapshot))} title={
                  snapshot
                    ? "Snapshot ON — every request stamps snapshot:true. Click to disable."
                    : "Snapshot OFF — click to capture full server-side snapshots per request."
                } aria-label={
                  snapshot
                    ? "Snapshot ON — every request stamps snapshot:true. Click to disable."
                    : "Snapshot OFF — click to capture full server-side snapshots per request."
                } />
            </>
          )}

          {showShare && (
            <IconButton
              icon={<Share2 />}
              onClick={() => setIsShareOpen(true)}
              label="Share conversation"
            />
          )}

          {/* DD-179 — the SAME conversation menu the production `/chat` route
              carries (one component, one registry, one thunk per verb): rename,
              archive, delete (soft and restorable). */}
          {isAuthenticated && conversationId && (
            <ConversationPageMenu
              conversationId={conversationId}
              href={`/demos/chat/c/${conversationId}`}
            />
          )}
        </div>
      </PageHeaderPortal>

      {isShareOpen && conversationId && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          resourceType="conversation"
          resourceId={conversationId}
          resourceName="Chat"
        />
      )}
    </>
  );
}
