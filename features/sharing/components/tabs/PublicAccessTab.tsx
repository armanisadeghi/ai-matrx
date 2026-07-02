'use client';

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Globe, AlertTriangle, Lock } from 'lucide-react';
import { ResourceType, Permission, ShareActionResult } from '@/utils/permissions';
import { PublicBadge } from '../PermissionBadge';
import { useToast } from '@/components/ui/use-toast';

interface PublicAccessTabProps {
  /** Whether is_public = true on the resource row */
  isPublic: boolean;
  /** The public permission row from the permissions table, if any */
  publicPermission?: Permission;
  isOwner: boolean;
  onMakePublic: () => Promise<ShareActionResult>;
  onRevokePublic: () => Promise<ShareActionResult>;
  resourceType: ResourceType;
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
  resourceName,
}: PublicAccessTabProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleToggle = async (checked: boolean) => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const result = checked ? await onMakePublic() : await onRevokePublic();
      if (result?.success !== false) {
        toast({
          title: checked ? 'Made public' : 'Made private',
          description: checked
            ? 'Anyone with the link can now access this resource'
            : 'Public access has been removed',
        });
      } else {
        toast({
          title: checked ? 'Failed to make public' : 'Failed to remove public access',
          description: result?.error || 'Please try again',
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
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
              ? 'Anyone with the link can access this — no sign-in required'
              : 'Enable to let anyone with the link access this resource'}
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

      {isPublic && (
        <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
            <strong>Public:</strong> Anyone with the link can access this {resourceType}. No sign-in required.
          </AlertDescription>
        </Alert>
      )}

      {!isPublic && (
        <div className="p-4 text-center space-y-2 bg-muted/30 rounded-lg border">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
          <div>
            <h4 className="text-sm font-medium mb-0.5">Resource is Private</h4>
            <p className="text-xs text-muted-foreground">
              Share with specific users or organizations, or make it public for open access
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
