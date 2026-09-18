"use client";

/**
 * SiteDiscoveryWindow — one site's business discovery, beside the current view.
 *
 * The window is the frame only. It WRAPS the canonical `DiscoveryWorkspace`
 * (the same component the brand's Knowledge route mounts): the Business
 * Discovery Ladder, the proposals it produced, and the doors to the settings
 * this customer finishes themselves. A bespoke body here would be a second
 * renderer that drifts (window-panels law).
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { DiscoveryWorkspace } from "@/features/marketing/seo/value-system/discovery/DiscoveryWorkspace";

export interface SiteDiscoveryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  brandId?: string | null;
  organizationId?: string | null;
  siteLabel?: string | null;
}

export default function SiteDiscoveryWindow({
  isOpen,
  onClose,
  siteId,
  brandId,
  organizationId,
  siteLabel,
}: SiteDiscoveryWindowProps) {
  if (!isOpen) return null;

  const collectData = () => ({
    siteId,
    brandId: brandId ?? "",
    organizationId: organizationId ?? "",
    siteLabel: siteLabel ?? "",
  });

  return (
    <WindowPanel
      id="site-discovery-window"
      overlayId="siteDiscoveryWindow"
      title={siteLabel ? `Business discovery — ${siteLabel}` : "Business discovery"}
      onClose={onClose}
      width={760}
      height={680}
      minWidth={420}
      minHeight={360}
      position="top-right"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <DiscoveryWorkspace
          siteId={siteId}
          brandId={brandId ?? null}
          organizationId={organizationId ?? null}
          siteLabel={siteLabel || siteId}
        />
      </div>
    </WindowPanel>
  );
}
