"use client";

/**
 * AgentCreateAppWindow — the Applet builder in a floating window.
 *
 * Wraps the ONE builder (`AppletBuilder`, the body of `/applets/build`): describe what you want, the
 * `applets.build` job drafts an Applet on your own tables, preview with held writes, Fix it, Use it.
 * The overlay id (`agentCreateAppWindow`) and registry slug (`agent-create-app-window`) are unchanged.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AppletBuilder } from "@/features/applets-host/builder/AppletBuilder";

const WINDOW_ID = "agent-create-app-window";
const OVERLAY_ID = "agentCreateAppWindow";

interface AgentCreateAppWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentCreateAppWindow({ isOpen, onClose }: AgentCreateAppWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Build an app"
      onClose={onClose}
      width={960}
      height={760}
      minWidth={560}
      minHeight={520}
      overlayId={OVERLAY_ID}
      bodyClassName="p-0"
    >
      <div className="flex h-full flex-col overflow-hidden">
        <AppletBuilder appletId={null} />
      </div>
    </WindowPanel>
  );
}
