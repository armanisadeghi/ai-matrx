"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ActiveMillerColumns } from "@/features/scopes/components/active-context/miller-columns/ActiveMillerColumns";

export interface ContextSwitcherWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId?: string;
}

export function ContextSwitcherWindow({
  isOpen,
  onClose,
  instanceId = "default",
}: ContextSwitcherWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id={`context-switcher-${instanceId}`}
      title="Working Context"
      onClose={onClose}
      minWidth={680}
      minHeight={500}
      width={940}
      height={650}
      position="center"
      overlayId="contextSwitcherWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <ActiveMillerColumns
        variant="full"
        className="h-full rounded-none border-0"
      />
    </WindowPanel>
  );
}
