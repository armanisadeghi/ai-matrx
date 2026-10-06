"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/styles/themes/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useWhatsAppMedia } from "../hooks/useWhatsAppMedia";
import { MediaTab } from "../modals/media/MediaTab";
import { LinksTab } from "../modals/media/LinksTab";
import { DocsTab } from "../modals/media/DocsTab";
import { GalleryToolbar } from "../modals/media/GalleryToolbar";
import { SegmentedControl } from "@ai-matrx/design-system/controls";

const OVERLAY_ID = "whatsappMedia";
const WINDOW_ID = "whatsapp-media";

type MediaTabId = "media" | "links" | "docs";

interface WhatsAppMediaWindowProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialTabId?: MediaTabId;
}

export function WhatsAppMediaWindow({
  onClose,
  initialTabId = "media",
}: WhatsAppMediaWindowProps) {
  const [activeId, setActiveId] = useState<MediaTabId>(initialTabId);
  const { media, links, docs } = useWhatsAppMedia();

  const counts: Record<MediaTabId, number> = {
    media: media.length,
    links: links.length,
    docs: docs.length,
  };

  const tabs: Array<{ id: MediaTabId; label: string }> = [
    { id: "media", label: "Media" },
    { id: "links", label: "Links" },
    { id: "docs", label: "Docs" },
  ];

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      title="Media, links and docs"
      titleNode={
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold text-foreground">
            Media
          </span>
          <span className="text-[11px] text-muted-foreground">
            From all chats
          </span>
        </div>
      }
      minWidth={760}
      minHeight={580}
      bodyClassName="p-0"
      onClose={onClose}
      actionsRight={
        <div className="flex items-center gap-2">
          <SegmentedControl aria-label="Media" value={activeId} onValueChange={setActiveId} data={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} />
          <GalleryToolbar />
        </div>
      }
      footerLeft={
        <span className="text-[13px] text-muted-foreground">
          {counts[activeId]} {tabs.find((t) => t.id === activeId)?.label}
        </span>
      }
      footerRight={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-emerald-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-600"
        >
          Done
        </button>
      }
    >
      <ScrollArea className="h-full w-full">
        <div className="bg-background py-3">
          {activeId === "media" ? <MediaTab items={media} /> : null}
          {activeId === "links" ? <LinksTab items={links} /> : null}
          {activeId === "docs" ? <DocsTab items={docs} /> : null}
        </div>
      </ScrollArea>
    </WindowPanel>
  );
}

export default WhatsAppMediaWindow;
