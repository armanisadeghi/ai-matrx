"use client";

import { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { QuickMessageTemplateSaveCore } from "@/features/message-templates/quick-save/QuickMessageTemplateSaveCore";
import type { MessageRole } from "@/features/message-templates/types/message-templates-db";

export interface QuickMessageTemplateSaveWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
  defaultName?: string;
  defaultRole?: MessageRole;
}

export default function QuickMessageTemplateSaveWindow({
  isOpen,
  onClose,
  initialContent,
  defaultName,
  defaultRole,
}: QuickMessageTemplateSaveWindowProps) {
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  if (!isOpen) return null;

  const viewportPad = 24;
  const maxWidth =
    typeof window !== "undefined" ? window.innerWidth - viewportPad : 1400;
  const maxHeight =
    typeof window !== "undefined" ? window.innerHeight - viewportPad : 900;

  return (
    <WindowPanel
      title="Save as Message Template"
      id="quick-message-template-save-window"
      overlayId="quickMessageTemplateSaveWindow"
      minWidth={520}
      minHeight={440}
      width="90vw"
      height="85dvh"
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      position="center"
      onClose={onClose}
      footerRight={<div ref={setFooterHost} className="flex items-center" />}
    >
      <div className="h-full min-h-0 p-3">
        <QuickMessageTemplateSaveCore
          initialContent={
            typeof initialContent === "string" ? initialContent : ""
          }
          defaultName={defaultName}
          defaultRole={defaultRole}
          onCancel={onClose}
          footerHost={footerHost}
        />
      </div>
    </WindowPanel>
  );
}
