"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, AlertTriangle, Check, Copy, Lock } from "lucide-react";
import { getShareableResource } from "@/utils/permissions/registry";
import { publicResourceUrl } from "@/utils/permissions/publicLane";
import type {
  Permission,
  ResourceType,
  ShareActionResult,
} from "@/utils/permissions/types";
import { PublicBadge } from "../PermissionBadge";
import { useToast } from "@/components/ui/use-toast";
import { ShareLinkPanel } from "../ShareLinkPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage } from "@/utils/errors";
import {
  getShareCapabilities,
  type ShareCapabilities,
} from "@/utils/permissions/shareLinks";

interface PublicAccessTabProps {
  /** Whether is_public = true on the resource row */
  isPublic: boolean;
  /** The public permission row from the permissions table, if any */
  publicPermission?: Permission;
  isOwner: boolean;
  onMakePublic: () => Promise<ShareActionResult>;
  onRevokePublic: () => Promise<ShareActionResult>;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
}

/**
 * PublicAccessTab — binary public / private toggle.
 *
 * Public = anyone with the link can read (no sign-in required).
 * Private = only owner + explicit user/org grants + hierarchy members.
 *
 * Uses make_resource_public() / make_resource_private() RPCs via the service.
 */
export function PublicAccessTab({
  isPublic,
  isOwner,
  onMakePublic,
  onRevokePublic,
  resourceType,
  resourceId,
  resourceName,
}: PublicAccessTabProps) {
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState<ShareCapabilities>({
    supportsPublic: false,
    isLinkShareable: false,
    publicState: null,
  });
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  /** Human label for the item kind — NEVER render the raw entity token. */
  const typeLabel =
    getShareableResource(resourceType)?.displayLabel?.toLowerCase() ?? "item";
  /** The indexable public page, when this type actually has one. */
  const publicUrl = publicResourceUrl(resourceType, resourceId);

  const copyPublicUrl = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Public link copied" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }, [publicUrl, toast]);

  useEffect(() => {
    let active = true;
    setCapabilitiesLoading(true);
    setCapabilitiesError(null);
    getShareCapabilities(resourceType)
      .then((c) => {
        if (active) setCaps(c);
      })
      .catch((error: unknown) => {
        if (active) setCapabilitiesError(extractErrorMessage(error));
      })
      .finally(() => {
        if (active) setCapabilitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceType]);

  const handleToggle = async (checked: boolean) => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const result = checked ? await onMakePublic() : await onRevokePublic();
      if (result?.success !== false) {
        toast({
          title: checked ? "Made public" : "Made private",
          description: checked
            ? "Anyone with the link can now access this resource"
            : "Public access has been removed",
        });
      } else {
        toast({
          title: checked
            ? "Failed to make public"
            : "Failed to remove public access",
          description: result?.error || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Please try again";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {capabilitiesLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : capabilitiesError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{capabilitiesError}</AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Anyone with the link — no-login token sharing (canonical) */}
          <ShareLinkPanel
            resourceType={resourceType}
            resourceId={resourceId}
            isOwner={isOwner}
            enabled={caps.isLinkShareable}
          />

          {!caps.supportsPublic ? (
            <div className="p-3 bg-muted/30 rounded-lg border flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Public visibility isn&rsquo;t available for this item type. Use
                a share link or invite specific people.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 p-3 bg-muted/30 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isPublic ? (
                      <>
                        <Globe className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <h3 className="text-sm font-medium">Public — Anyone</h3>
                        <PublicBadge variant="compact" />
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <h3 className="text-sm font-medium">Public Access</h3>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isPublic
                      ? publicUrl
                        ? "Open to everyone — anyone can view the public page below, no sign-in required"
                        : "Marked open to everyone. Use a no-login link above to give someone the actual address."
                      : publicUrl
                        ? "Turn on to publish a public page anyone can open — no sign-in required"
                        : `Turn on to mark this ${typeLabel} open to everyone. It has no public page of its own, so share the address with a no-login link.`}
                  </p>
                </div>

                {isOwner ? (
                  <Switch
                    checked={isPublic}
                    onCheckedChange={handleToggle}
                    disabled={loading}
                    className="flex-shrink-0"
                  />
                ) : isPublic ? (
                  <PublicBadge variant="compact" />
                ) : null}
              </div>

              {isPublic && publicUrl && (
                <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border">
                  <p className="text-xs font-medium">Public page</p>
                  <div className="flex items-center gap-1.5 rounded-md border bg-background p-1.5">
                    <Input
                      readOnly
                      value={publicUrl}
                      className="h-8 flex-1 text-xs font-mono"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={copyPublicUrl}
                      title="Copy public link"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isPublic && (
                <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
                    <strong>Open to everyone:</strong> any signed-in person can
                    view this {typeLabel}
                    {publicUrl
                      ? ", and the public page above opens with no sign-in."
                      : ". It has no public page of its own — people reach it through a no-login link or from inside the app."}
                  </AlertDescription>
                </Alert>
              )}

              {!isPublic && (
                <div className="p-4 text-center space-y-2 bg-muted/30 rounded-lg border">
                  <Lock className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                  <div>
                    <h4 className="text-sm font-medium mb-0.5">
                      Not open to everyone
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Only you, people you share with, and members of the
                      organizations you share with can open this {typeLabel}.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
