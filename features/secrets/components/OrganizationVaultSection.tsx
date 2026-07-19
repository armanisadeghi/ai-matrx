"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOrganizationMembers } from "@/features/organizations/hooks";
import { useOrganizationVault } from "@/features/secrets/organization-hooks";
import { useSecrets } from "@/features/secrets/hooks";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  VALID_KEY_RE,
  type OrganizationSecretSummary,
  type SecretAccessMode,
  type SecretCategory,
} from "@/features/secrets/types";

interface OrganizationVaultSectionProps {
  organizationId: string;
  canManage: boolean;
}

export function OrganizationVaultSection({
  organizationId,
  canManage,
}: OrganizationVaultSectionProps) {
  const vault = useOrganizationVault(organizationId);
  const userVault = useSecrets();
  const { members } = useOrganizationMembers(canManage ? organizationId : undefined);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationSecretSummary | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="space-y-1 text-xs">
            <p className="font-medium text-foreground">
              Members can use organization secrets, but cannot reveal them.
            </p>
            <p className="text-muted-foreground">
              New entries are available to every member by default. Values are encrypted in
              Supabase Vault and only resolved inside trusted server operations.
            </p>
          </div>
        </div>
      </div>

      {canManage && <CreateSecretForm busy={vault.busy} onCreate={vault.create} />}

      <ContributeSecretForm
        busy={vault.busy || userVault.loading}
        secrets={userVault.secrets}
        onContribute={vault.contribute}
      />

      {vault.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {vault.error}
        </div>
      )}

      {vault.loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organization vault…
        </div>
      ) : vault.secrets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <KeyRound className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No shared secrets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManage
              ? "Add one above, or copy an entry from your personal vault."
              : "Copy an entry from your personal vault to contribute it."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {vault.secrets.map((secret) => (
            <SecretRow
              key={secret.id}
              secret={secret}
              canManage={canManage}
              busy={vault.busy}
              members={members}
              userOwnsSource={userVault.secrets.some(
                (source) => source.id === secret.source_user_secret_id,
              )}
              onUpdate={(body) => vault.update(secret.id, body)}
              onSync={() => vault.sync(secret.id)}
              onPermissions={(body) => vault.permissions(secret.id, body)}
              onDelete={() => setDeleteTarget(secret)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !vault.busy) setDeleteTarget(null);
        }}
        title="Delete organization secret"
        description={
          <>
            Delete <b>{deleteTarget?.key}</b> from the organization vault? Existing jobs that
            depend on this key will stop working.
          </>
        }
        confirmLabel="Delete secret"
        variant="destructive"
        busy={vault.busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await vault.remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function CreateSecretForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: ReturnType<typeof useOrganizationVault>["create"];
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SecretCategory>("custom");
  const [inject, setInject] = useState(true);
  const valid = VALID_KEY_RE.test(key);

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || !value) return;
        await onCreate({
          key,
          value,
          description: description || null,
          category,
          inject_into_sandbox: inject,
        });
        setKey("");
        setValue("");
        setDescription("");
      }}
    >
      <div>
        <p className="text-sm font-medium">Add an organization secret</p>
        <p className="text-xs text-muted-foreground">
          The value is write-only. After saving, only a masked hint is returned.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="org-secret-key">Key</Label>
          <Input
            id="org-secret-key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="GOOGLE_SEARCH_CONSOLE_KEY"
            className="font-mono"
            aria-invalid={Boolean(key) && !valid}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-secret-category">Category</Label>
          <Select value={category} onValueChange={(next) => setCategory(next as SecretCategory)}>
            <SelectTrigger id="org-secret-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {CATEGORY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-secret-value">Value</Label>
        <Input
          id="org-secret-value"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste the secret value"
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-secret-description">Description</Label>
        <Input
          id="org-secret-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What uses this key?"
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-2.5">
        <div>
          <Label htmlFor="org-secret-inject">Inject into organization sandboxes</Label>
          <p className="text-xs text-muted-foreground">Personal values override same-named keys.</p>
        </div>
        <Switch id="org-secret-inject" checked={inject} onCheckedChange={setInject} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || !valid || !value}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Save for everyone
        </Button>
      </div>
    </form>
  );
}

function ContributeSecretForm({
  busy,
  secrets,
  onContribute,
}: {
  busy: boolean;
  secrets: ReturnType<typeof useSecrets>["secrets"];
  onContribute: ReturnType<typeof useOrganizationVault>["contribute"];
}) {
  const [sourceId, setSourceId] = useState("");
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="org-secret-contribute">Contribute from your vault</Label>
          {secrets.length > 0 ? (
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="org-secret-contribute">
                <SelectValue placeholder="Choose a personal secret" />
              </SelectTrigger>
              <SelectContent>
                {secrets.map((secret) => (
                  <SelectItem key={secret.id} value={secret.id}>
                    {secret.key} · {secret.value_hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              Your vault is empty. <Link className="text-primary underline" href="/settings/secrets">Add a personal secret</Link> first.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            This creates an independent organization copy. Later changes stay separate until you sync.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !sourceId}
          onClick={async () => {
            await onContribute({ user_secret_id: sourceId });
            setSourceId("");
          }}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Copy to organization
        </Button>
      </div>
    </div>
  );
}

function SecretRow({
  secret,
  canManage,
  busy,
  members,
  userOwnsSource,
  onUpdate,
  onSync,
  onPermissions,
  onDelete,
}: {
  secret: OrganizationSecretSummary;
  canManage: boolean;
  busy: boolean;
  members: ReturnType<typeof useOrganizationMembers>["members"];
  userOwnsSource: boolean;
  onUpdate: ReturnType<typeof useOrganizationVault>["update"] extends (
    id: string,
    body: infer Body,
  ) => unknown
    ? (body: Body) => Promise<unknown>
    : never;
  onSync: () => Promise<unknown>;
  onPermissions: ReturnType<typeof useOrganizationVault>["permissions"] extends (
    id: string,
    body: infer Body,
  ) => unknown
    ? (body: Body) => Promise<unknown>
    : never;
  onDelete: () => void;
}) {
  const [rotateValue, setRotateValue] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accessMode, setAccessMode] = useState<SecretAccessMode>(secret.access_mode);
  const [grantIds, setGrantIds] = useState<string[]>(secret.grant_user_ids);
  const syncable = secret.sync_status === "out_of_sync" && (canManage || userOwnsSource);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-semibold">{secret.key}</code>
            <Badge variant={secret.access_mode === "all_members" ? "secondary" : "outline"}>
              {secret.access_mode === "all_members" ? "All members" : "Restricted"}
            </Badge>
            {secret.sync_status === "out_of_sync" && <Badge variant="outline">Out of sync</Badge>}
            {secret.sync_status === "current" && (
              <Badge variant="outline" className="gap-1 text-emerald-600">
                <Check className="h-3 w-3" /> Synced copy
              </Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{secret.value_hint}</p>
          {secret.description && <p className="mt-1 text-xs text-muted-foreground">{secret.description}</p>}
        </div>
        {syncable && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSync()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Sync from personal
          </Button>
        )}
        {canManage && (
          <Button size="icon" variant="ghost" disabled={busy} onClick={onDelete} aria-label={`Delete ${secret.key}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      {canManage && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`rotate-${secret.id}`}>Rotate value</Label>
              <Input
                id={`rotate-${secret.id}`}
                type="password"
                value={rotateValue}
                onChange={(event) => setRotateValue(event.target.value)}
                placeholder="New value"
                className="font-mono"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !rotateValue}
              onClick={async () => {
                await onUpdate({ value: rotateValue });
                setRotateValue("");
              }}
            >
              Rotate
            </Button>
            <div className="flex items-center gap-2 pb-1">
              <Label htmlFor={`inject-${secret.id}`} className="text-xs">Sandbox</Label>
              <Switch
                id={`inject-${secret.id}`}
                checked={secret.inject_into_sandbox}
                disabled={busy}
                onCheckedChange={(checked) => void onUpdate({ inject_into_sandbox: checked })}
              />
            </div>
          </div>

          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? "Hide access settings" : "Access settings"}
          </button>
          {showAdvanced && (
            <div className="space-y-3 rounded-md bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor={`access-${secret.id}`}>Who can use this secret?</Label>
                <Select value={accessMode} onValueChange={(next) => setAccessMode(next as SecretAccessMode)}>
                  <SelectTrigger id={`access-${secret.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_members">All organization members (default)</SelectItem>
                    <SelectItem value="restricted">Only selected members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {accessMode === "restricted" && (
                <div className="grid gap-2 md:grid-cols-2">
                  {members.map((member) => (
                    <label key={member.userId} className="flex items-center gap-2 rounded border bg-background p-2 text-xs">
                      <Checkbox
                        checked={grantIds.includes(member.userId)}
                        onCheckedChange={(checked) => {
                          setGrantIds((current) =>
                            checked
                              ? [...new Set([...current, member.userId])]
                              : current.filter((id) => id !== member.userId),
                          );
                        }}
                      />
                      <span className="min-w-0 truncate">
                        {member.user?.displayName || member.user?.email || member.userId}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Organization owners and admins retain emergency use access.
                </p>
                <Button
                  size="sm"
                  disabled={busy || (accessMode === "restricted" && grantIds.length === 0)}
                  onClick={() => void onPermissions({ access_mode: accessMode, user_ids: grantIds })}
                >
                  Save access
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
