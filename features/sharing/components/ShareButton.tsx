"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Share2, Globe, Lock } from "lucide-react";
import { useSharingStatus } from "@/utils/permissions";
import type { ResourceType } from "@/utils/permissions";
import { ShareModal } from "./ShareModal";

interface ShareButtonProps {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  isOwner: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showStatus?: boolean;
}

/**
 * ShareButton - Quick access button to open sharing modal
 *
 * Generic, reusable component that works with ANY resource type.
 * Shows current sharing status and opens the ShareModal.
 *
 * @example
 * <ShareButton
 *   resourceType="note"
 *   resourceId={noteId}
 *   resourceName={note.title}
 *   isOwner={isOwner}
 * />
 */
export function ShareButton({
  resourceType,
  resourceId,
  resourceName,
  isOwner,
  variant = "outline",
  size = "default",
  showStatus = true,
}: ShareButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isPublic, loading, refresh } = useSharingStatus(
    resourceType,
    resourceId,
  );

  // Only is_public is checked here — single cheap resource-row query.
  // Showing "Shared with N users" on list buttons would require the expensive
  // get_resource_permissions RPC per card. Full detail is inside the modal.
  const getButtonContent = () => {
    if (loading) return { icon: Share2, label: "Share" };
    if (isPublic)
      return { icon: Globe, label: showStatus ? "Public" : "Share" };
    return { icon: Lock, label: showStatus ? "Private" : "Share" };
  };

  const { icon: Icon, label } = getButtonContent();

  const button = (
    <Button
      variant={variant}
      size={size}
      onClick={() => setIsModalOpen(true)}
      className="gap-2"
    >
      <Icon className="w-4 h-4" />
      {size !== "icon" && <span>{label}</span>}
    </Button>
  );

  return (
    <>
      {size === "icon" ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top">
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}

      <ShareModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          void refresh();
        }}
        resourceType={resourceType}
        resourceId={resourceId}
        resourceName={resourceName}
        isOwner={isOwner}
      />
    </>
  );
}
