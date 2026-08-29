"use client";

// /organizations/[orgId]/settings/api-keys — the API-key management surface
// (ratified C16, 2026-08-29; design: common-docs/projects/
// npm-package-extraction/API-KEY-LANE-DESIGN.md).
//
// Org OWNERS mint and revoke machine credentials here. Everything is
// direct-to-Supabase: the list is an RLS-backed read of iam.api_keys; create/
// revoke call the owner-gated SECURITY DEFINER RPCs. The full secret
// (`mx_live_...`) is shown exactly once at creation — only its SHA-256 hash
// rests in the database.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import {
  useResolvedOrganization,
  useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import {
  createOrgApiKey,
  listOrgApiKeys,
  revokeOrgApiKey,
  type CreatedApiKey,
  type OrgApiKey,
} from "@/features/organizations/apiKeysService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function OrgApiKeysPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { organization, organizationId, loading, error, refresh } =
    useResolvedOrganization(orgId);
  const { loading: roleLoading, isOwner } = useUserRole(
    organizationId ?? undefined,
  );

  const [keys, setKeys] = useState<OrgApiKey[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OrgApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = useCallback(async () => {
    if (!organizationId) return;
    try {
      setListError(null);
      setKeys(await listOrgApiKeys(organizationId));
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }, [organizationId]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!organizationId || !newName.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const result = await createOrgApiKey(organizationId, newName.trim());
      setCreated(result);
      setNewName("");
      await loadKeys();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setActionError(null);
    try {
      await revokeOrgApiKey(revokeTarget.id);
      setRevokeTarget(null);
      await loadKeys();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(false);
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error || !organization || !organizationId) {
    return (
      <OrganizationAccessGate
        orgSlugOrId={orgId}
        organizationId={organizationId ?? undefined}
        onRetry={refresh}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <CrumbTrailHeader
          trail={[
            { label: organization.name, href: `/organizations/${orgId}` },
            { label: "Settings", href: `/organizations/${orgId}/settings` },
            { label: "API Keys" },
          ]}
        />
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm flex-1">
              <p className="font-medium">
                Machine credentials for this organization.
              </p>
              <p className="mt-1 text-muted-foreground">
                An API key authenticates as its own service identity, scoped to
                exactly this organization — send it as{" "}
                <code className="font-mono">
                  Authorization: Bearer mx_live_…
                </code>
                . The full key is shown once at creation; only a hash is
                stored. Revocation takes effect immediately.
              </p>
              {!isOwner && (
                <p className="mt-2 text-muted-foreground">
                  Creating and revoking keys is owner-only.
                </p>
              )}
            </div>
            {isOwner && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New key
              </Button>
            )}
          </div>

          {listError && (
            <p className="text-sm text-destructive" role="alert">
              {listError}
            </p>
          )}
          {actionError && (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}

          {keys === null ? (
            <Skeleton className="h-32 w-full" />
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <KeyRound className="h-5 w-5 mx-auto mb-2" />
              No API keys yet.
              {isOwner && " Create one to let a machine act for this organization."}
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{key.name}</span>
                      <Badge
                        variant={key.status === "active" ? "default" : "secondary"}
                      >
                        {key.status}
                      </Badge>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {key.display_prefix}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div>Created {formatDate(key.created_at)}</div>
                    <div>
                      {key.status === "revoked"
                        ? `Revoked ${formatDate(key.revoked_at)}`
                        : `Last used ${formatDate(key.last_used_at)}`}
                    </div>
                  </div>
                  {isOwner && key.status === "active" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRevokeTarget(key)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create dialog — two phases: name entry, then the show-once secret. */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setCreated(null);
            setNewName("");
          }
        }}
      >
        <DialogContent>
          {created === null ? (
            <>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Name the key for what will use it (e.g. &ldquo;CI
                  deploy&rdquo;, &ldquo;partner sync&rdquo;). The name appears
                  in audit trails.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                placeholder="Key name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
              <DialogFooter>
                <Button
                  onClick={() => void handleCreate()}
                  disabled={creating || !newName.trim()}
                >
                  {creating && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Create key
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Copy your API key now</DialogTitle>
                <DialogDescription>
                  This is the only time the full key is shown. It cannot be
                  recovered — only revoked and replaced.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
                  {created.api_key}
                </code>
                <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setCreateOpen(false);
                    setCreated(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke &ldquo;{revokeTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this key stops authenticating immediately. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRevoke();
              }}
            >
              {revoking && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
