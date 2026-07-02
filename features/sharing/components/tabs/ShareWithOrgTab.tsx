"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Building2, Check } from "lucide-react";
import { PermissionLevel, ResourceType, ShareActionResult } from "@/utils/permissions";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { PermissionLevelDescription } from "../PermissionBadge";
import { useToast } from "@/components/ui/use-toast";

interface ShareWithOrgTabProps {
  onShare: (orgId: string, level: PermissionLevel) => Promise<ShareActionResult>;
  onSuccess: () => void;
  resourceType: ResourceType;
  /** IDs of organizations that already have access (to disable in dropdown) */
  sharedOrgIds?: string[];
}

/**
 * ShareWithOrgTab - Form to share with an organization
 */
export function ShareWithOrgTab({
  onShare,
  onSuccess,
  resourceType,
  sharedOrgIds = [],
}: ShareWithOrgTabProps) {
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [permissionLevel, setPermissionLevel] =
    useState<PermissionLevel>("viewer");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { orgs, isLoading: orgsLoading } = useNavTree();

  const shareableOrgs = orgs.filter((org) => !org.is_personal);

  const handleShare = async () => {
    if (!selectedOrgId) {
      toast({
        title: "Select an organization",
        description: "Please select an organization to share with",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await onShare(selectedOrgId, permissionLevel);

      if (result.success) {
        const org = shareableOrgs.find((o) => o.id === selectedOrgId);
        toast({
          title: "Shared successfully",
          description: `Shared with ${org?.name || "organization"}`,
        });
        setSelectedOrgId("");
        setPermissionLevel("viewer");
        onSuccess();
      } else {
        toast({
          title: "Failed to share",
          description: result.error || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to share";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (orgsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (shareableOrgs.length === 0) {
    return (
      <div className="p-6 text-center space-y-3 bg-muted/30 rounded-lg border flex flex-col items-center justify-center">
        <Building2 className="w-12 h-12 mx-auto text-muted-foreground opacity-20" />
        <div>
          <h4 className="text-sm font-medium mb-1">
            Organization Management Coming Soon
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            The organization management system is still being built
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            In the meantime, you can:
          </p>
          <ul className="text-xs text-left text-muted-foreground space-y-1 max-w-xs mx-auto">
            <li>• Share with specific users instead</li>
            <li>• Make resources public for everyone</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-3 bg-muted/30 rounded-lg border">
      <div>
        <h3 className="text-sm font-medium mb-1">Share with Organization</h3>
        <p className="text-xs text-muted-foreground">
          All members of the organization will have access
        </p>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="org-select" className="text-xs">
            Organization
          </Label>
          <Select
            value={selectedOrgId}
            onValueChange={setSelectedOrgId}
            disabled={loading}
          >
            <SelectTrigger id="org-select" className="h-9">
              <SelectValue placeholder="Select an organization" />
            </SelectTrigger>
            <SelectContent>
              {shareableOrgs.map((org) => {
                const alreadyShared = sharedOrgIds.includes(org.id);
                return (
                  <SelectItem
                    key={org.id}
                    value={org.id}
                    disabled={alreadyShared}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3 h-3" />
                      <span
                        className={alreadyShared ? "text-muted-foreground" : ""}
                      >
                        {org.name}
                      </span>
                      {alreadyShared ? (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Check className="w-3 h-3" />
                          Shared
                        </span>
                      ) : null}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="org-permission" className="text-xs">
            Permission Level
          </Label>
          <Select
            value={permissionLevel}
            onValueChange={(value) =>
              setPermissionLevel(value as PermissionLevel)
            }
            disabled={loading}
          >
            <SelectTrigger id="org-permission" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <PermissionLevelDescription level={permissionLevel} />
        </div>

        <Button
          onClick={handleShare}
          disabled={loading || !selectedOrgId}
          className="w-full h-9"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sharing...
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4 mr-2" />
              Share with Organization
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
