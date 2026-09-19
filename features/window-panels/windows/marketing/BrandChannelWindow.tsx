"use client";

/**
 * BrandChannelWindow — one client's owned YouTube channel beside whatever the
 * reader was already looking at.
 *
 * The window is the FRAME only: it wraps the canonical `BrandChannelPanel`,
 * the same component the brand Analytics route mounts. A bespoke body here
 * would be a second renderer that drifts (the window-panels law,
 * `features/window-panels/FEATURE.md` § A PANEL WRAPS THE CANONICAL COMPONENT)
 * — and there is deliberately no channel logic in this file at all: no read, no
 * refresh, no binding, no scoring.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { BrandChannelPanel } from "@/features/marketing/youtube/components/BrandChannelPanel";

export interface BrandChannelWindowProps {
  isOpen: boolean;
  onClose: () => void;
  brandId: string;
  brandLabel?: string | null;
}

export default function BrandChannelWindow({
  isOpen,
  onClose,
  brandId,
  brandLabel,
}: BrandChannelWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      id="brand-channel-window"
      overlayId="brandChannelWindow"
      title={brandLabel ? `YouTube — ${brandLabel}` : "YouTube channel"}
      onClose={onClose}
      width={860}
      height={720}
      minWidth={420}
      minHeight={360}
      position="top-right"
      onCollectData={() => ({ brandId, brandLabel: brandLabel ?? "" })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <BrandChannelPanel brandId={brandId} variant="bare" />
      </div>
    </WindowPanel>
  );
}
