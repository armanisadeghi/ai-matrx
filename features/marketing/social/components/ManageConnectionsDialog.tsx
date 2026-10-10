"use client";

/**
 * The full connection hub (every network's accounts, permissions, reconnect, disconnect) behind the
 * Accounts tab's "Manage connections". It stays out of the first screen: the table is the page, and
 * connection state lives per row. It also opens by itself on the way back from a provider's consent.
 */

import { SocialConnectionsPanel } from "@/features/social-connections/SocialConnectionsPanel";
import { CustomerAccountsPanel } from "@/features/social-connections/CustomerAccountsPanel";
import { TikTokConnectionsPanel } from "@/features/tiktok-connections/TikTokConnectionsPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const HUB_PROVIDERS = ["pinterest", "facebook", "instagram", "threads", "linkedin", "snapchat", "reddit"] as const;

/** Query parameters a provider's consent sends the person back with. */
export const CONNECTION_RETURN_PARAMS = ["x_oauth_status", "oauth_status", "tiktok_state", "tiktok_code"] as const;

export function ManageConnectionsDialog({
  open,
  onOpenChange,
  organizationId,
  brandId,
  brandSeg,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brandId: string;
  brandSeg: string;
  onChanged: () => void;
}) {
  const returnUrl = `/marketing/${brandSeg}/socials/accounts`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage connections</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <SocialConnectionsPanel brandId={brandId} organizationId={organizationId} returnUrl={returnUrl} onChanged={onChanged} />
          <CustomerAccountsPanel organizationId={organizationId} brandId={brandId} returnUrl={returnUrl} providers={HUB_PROVIDERS} />
          <TikTokConnectionsPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
