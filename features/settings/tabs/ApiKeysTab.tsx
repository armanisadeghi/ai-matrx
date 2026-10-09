"use client";

/**
 * Settings → Connectors → API keys: the person's own API keys.
 *
 * Arman's ruling, 2026-09-29 ("case 1, dead simple"): a personal key IS the
 * person, with their full access — no scopes, no app registration. The only
 * questions are a name and the organization the key works in when a request
 * names none. Expiry is the organization's maximum key age, applied by the
 * server. Data: `features/settings/personalApiKeysService.ts` (three iam doors,
 * direct to Supabase). The secret is held in component state only while the
 * one-time reveal is on screen, and is dropped when the person closes it.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorNotice } from "@ai-matrx/design-system";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  PERSONAL_API_BASE_URL,
  createPersonalApiKey,
  listPersonalApiKeys,
  revokePersonalApiKey,
  type CreatedPersonalApiKey,
  type PersonalApiKey,
} from "@/features/settings/personalApiKeysService";

function formatDate(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function ApiKeysTab() {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const { organizations, loading: orgsLoading, error: orgsError } =
    useUserOrganizations();

  const [keys, setKeys] = useState<PersonalApiKey[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPersonalApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<PersonalApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = async () => {
    const outcome = await listPersonalApiKeys().then(
      (rows) => ({ rows, error: null }),
      (e: unknown) => ({ rows: null, error: errorMessage(e) }),
    );
    setListError(outcome.error);
    setKeys((current) => outcome.rows ?? current ?? []);
  };

  useEffect(() => {
    let active = true;
    void listPersonalApiKeys().then(
      (rows) => {
        if (active) setKeys(rows);
      },
      (e: unknown) => {
        if (!active) return;
        setListError(errorMessage(e));
        setKeys([]);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const orgOptions = organizations.map((o) => ({ value: o.id, label: o.name }));

  // One organization: it is the answer, so it is chosen for the person.
  // org-fallback-deliberate: exactly one membership is the answer (boot-ladder rung 3), nothing is guessed; with several the person must pick
  const chosenOrgId =
    orgId || (organizations.length === 1 ? organizations[0].id : "");

  const openForm = () => {
    setCreated(null);
    setCreateError(null);
    setName("");
    setOrgId("");
    setFormOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !chosenOrgId) return;
    setCreating(true);
    setCreateError(null);
    const outcome = await createPersonalApiKey(name.trim(), chosenOrgId).then(
      (result) => ({ result, error: null }),
      (e: unknown) => ({ result: null, error: errorMessage(e) }),
    );
    setCreating(false);
    if (!outcome.result) {
      setCreateError(outcome.error);
      return;
    }
    setCreated(outcome.result);
    setCopied(false);
    setFormOpen(false);
    setName("");
    await loadKeys();
  };

  const handleCopy = async () => {
    if (!created) return;
    if (!(await copyText(created.api_key, "Key copied", "Your browser did not allow copying. Select the key and copy it by hand before you close this."))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevoking(true);
    const failure = await revokePersonalApiKey(target.id).then(
      () => null,
      (e: unknown) => errorMessage(e),
    );
    setRevoking(false);
    if (failure) {
      toast.error("The key was not revoked", { description: failure });
      return;
    }
    setRevokeTarget(null);
    toast.success(`"${target.name}" is revoked`);
    await loadKeys();
  };

  const newKeyButton = !formOpen && (
    <Button icon={<Plus />} variant="outline" onClick={openForm}>
      New key
    </Button>
  );

  return (
    <>
      <SettingsSubHeader
        title="API keys"
        description="Keys that let your own programs use AI Matrx as you."
        icon={KeyRound}
      />

      {created && (
        <SettingsSection title={`Your new key: ${created.name}`}>
          <div className="space-y-3 px-4 py-3.5">
            <SettingsCallout tone="warning">
              This is the only time the full key is shown. Treat it like your
              password: it can do everything you can do in AI Matrx.
            </SettingsCallout>
            <div className="flex items-start gap-2">
              <code
                data-secret="personal-api-key"
                className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"
              >
                {created.api_key}
              </code>
              <Button
                icon={copied ? (
                  <Check />
                ) : (
                  <Copy />
                )}
                variant="outline"
                aria-label={copied ? "Copied" : "Copy key"}
                onClick={() => void handleCopy()}
              />
            </div>
            {created.expiry_capped && created.expires_at && (
              <p className="text-xs text-muted-foreground">
                Expires {formatDate(created.expires_at)} under your
                organization&apos;s key limit.
              </p>
            )}
          </div>
          {/* Written out in full: a truncated URL is one a person cannot type. */}
          <dl className="space-y-2 border-t border-border/40 px-4 py-3.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-28 shrink-0 font-medium">API base URL</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                {PERSONAL_API_BASE_URL}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-28 shrink-0 font-medium">Header</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                Authorization: Bearer &lt;key&gt;
              </dd>
            </div>
          </dl>
          <SettingsButton
            label="Hide the key"
            description="The key is never shown again; copy it first."
            actionLabel="Done"
            kind="default"
            onClick={() => {
              setCreated(null);
              setCopied(false);
            }}
            last
          />
        </SettingsSection>
      )}

      {formOpen && (
        <SettingsSection
          title="New key"
          action={
            <Button
              variant="quiet"
              onClick={() => {
                setFormOpen(false);
                setCreateError(null);
              }}
              disabled={creating}
            >
              Cancel
            </Button>
          }
        >
          <SettingsTextInput
            label="Name"
            description="What will use it, so you can tell your keys apart."
            placeholder="usage tracker"
            value={name}
            onValueChange={setName}
            maxLength={120}
            width="lg"
          />
          <SettingsSelect
            label="Organization"
            description="Where the key works when a request names no organization."
            value={chosenOrgId}
            onValueChange={setOrgId}
            options={orgOptions}
            placeholder={orgsLoading ? "Loading your organizations" : "Choose one"}
            width="lg"
            disabled={orgsLoading || orgOptions.length === 0}
            error={orgsError ?? undefined}
          />
          <SettingsButton
            label="Create key"
            description="Works until you revoke it or it hits your org's max age."
            actionLabel="Create"
            kind="default"
            onClick={() => void handleCreate()}
            loading={creating}
            disabled={!name.trim() || !chosenOrgId}
            error={createError ?? undefined}
            last
          />
        </SettingsSection>
      )}

      <SettingsSection title="Your keys" action={newKeyButton || undefined}>
        {listError && (
          <div className="px-4 py-3">
            <ErrorNotice size="inline" className="text-sm" message={listError} />
          </div>
        )}
        {keys === null ? (
          <p className="px-4 py-3.5 text-sm text-muted-foreground">
            Loading your keys
          </p>
        ) : keys.length === 0 ? (
          !listError && (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              You have no API keys yet. Make one to let a program of yours work
              as you.
            </p>
          )
        ) : (
          keys.map((key, index) => {
            const active = key.status === "active";
            return (
              <SettingsRow
                key={key.id}
                label={key.name}
                icon={KeyRound}
                labelFor={null}
                meta={
                  <span className="font-mono text-xs">{key.display_prefix}</span>
                }
                description={
                  <>
                    Works in {key.organization_name ?? "an organization you left"}
                    {" · "}Created {formatDate(key.created_at)}
                    {" · "}Last used {formatDate(key.last_used_at)}
                    {" · "}
                    {active
                      ? key.expires_at
                        ? `Expires ${formatDate(key.expires_at)}`
                        : "Does not expire"
                      : `Revoked ${formatDate(key.revoked_at)}`}
                  </>
                }
                last={index === keys.length - 1}
              >
                {active ? (
                  <Button
                    variant="outline"
                    onClick={() => setRevokeTarget(key)}
                  >
                    Revoke
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Revoked</span>
                )}
              </SettingsRow>
            );
          })
        )}
      </SettingsSection>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setRevokeTarget(null);
        }}
        title={`Revoke "${revokeTarget?.name ?? ""}"?`}
        description="Programs using this key stop working immediately. This cannot be undone."
        confirmLabel="Revoke key"
        variant="destructive"
        busy={revoking}
        onConfirm={handleRevoke}
      />
    </>
  );
}
