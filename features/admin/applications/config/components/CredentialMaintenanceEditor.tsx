"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CREDENTIAL_ID_REGEX,
  getCredentialExpiryStatus,
  recordCredentialRotation,
  type CredentialMaintenanceEntry,
} from "@/features/admin/applications/config/credential-maintenance";
import { formatText } from "@/utils/text/text-case-converter";

interface CredentialMaintenanceEditorProps {
  entries: Record<string, CredentialMaintenanceEntry>;
  malformedEntries: Record<string, unknown>;
  errors: Record<string, string>;
  focusCredentialId?: string;
  onChange: (entries: Record<string, CredentialMaintenanceEntry>) => void;
  onRemoveMalformed: (id: string) => void;
}

function isoToLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function newCredential(id: string): CredentialMaintenanceEntry {
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 180);

  return {
    label: formatText(id),
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    warning_days: 14,
    validity_days: 180,
    source_url: "",
    deployment_url: "",
    notes: "",
  };
}

export function CredentialMaintenanceEditor({
  entries,
  malformedEntries,
  errors,
  focusCredentialId,
  onChange,
  onRemoveMalformed,
}: CredentialMaintenanceEditorProps) {
  const [newId, setNewId] = useState("");
  const [newIdError, setNewIdError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusCredentialId) return;
    document
      .getElementById(`credential-maintenance-${focusCredentialId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusCredentialId]);

  const updateEntry = (
    id: string,
    patch: Partial<CredentialMaintenanceEntry>,
  ) => {
    onChange({
      ...entries,
      [id]: { ...entries[id], ...patch },
    });
  };

  const addCredential = () => {
    const id = newId.trim();
    if (!CREDENTIAL_ID_REGEX.test(id)) {
      setNewIdError("Use lowercase kebab-case (for example, apple-sign-in).");
      return;
    }
    if (id in entries || id in malformedEntries) {
      setNewIdError("That credential ID already exists.");
      return;
    }
    onChange({ ...entries, [id]: newCredential(id) });
    setNewId("");
    setNewIdError(null);
  };

  const sortedEntries = Object.entries(entries).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Store lifecycle metadata only. Private keys and client secrets must
            never be pasted or saved here. Complete the real provider rotation
            first, then record its dates below.
          </p>
        </div>
      </div>

      {Object.entries(malformedEntries).map(([id, value]) => (
        <div
          key={id}
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" /> Invalid credential entry:
                <code>{id}</code>
              </p>
              <pre className="mt-2 max-h-28 overflow-auto text-xs text-muted-foreground">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onRemoveMalformed(id)}
            >
              Remove invalid entry
            </Button>
          </div>
        </div>
      ))}

      {sortedEntries.map(([id, entry]) => {
        const status = getCredentialExpiryStatus(entry);
        const errorPrefix = `credential_maintenance.${id}`;

        return (
          <article
            key={id}
            id={`credential-maintenance-${id}`}
            className="scroll-mt-20 space-y-4 rounded-md border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">{entry.label}</h4>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {id}
                  </Badge>
                  <Badge variant={status.expired ? "destructive" : "secondary"}>
                    {status.expired
                      ? "Expired"
                      : `${status.daysLeft} days remaining`}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Record rotation updates the draft only. The page-level Save
                  button still shows the audited diff before anything changes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <a href={entry.source_url} target="_blank" rel="noreferrer">
                    Rotate at source{" "}
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button type="button" size="sm" variant="outline" asChild>
                  <a
                    href={entry.deployment_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Update consumer{" "}
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    updateEntry(id, recordCredentialRotation(entry))
                  }
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Record rotation
                  now
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${entry.label}`}
                  onClick={() => {
                    const next = { ...entries };
                    delete next[id];
                    onChange(next);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-label`}>Display label</Label>
                <Input
                  id={`${id}-label`}
                  value={entry.label}
                  onChange={(event) =>
                    updateEntry(id, { label: event.target.value })
                  }
                />
                {errors[`${errorPrefix}.label`] ? (
                  <p className="text-xs text-destructive">
                    {errors[`${errorPrefix}.label`]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-key-id`}>Provider key ID</Label>
                <Input
                  id={`${id}-key-id`}
                  value={entry.key_id ?? ""}
                  onChange={(event) =>
                    updateEntry(id, {
                      key_id: event.target.value || undefined,
                    })
                  }
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-validity-days`}>Validity (days)</Label>
                <Input
                  id={`${id}-validity-days`}
                  type="number"
                  min={1}
                  max={3650}
                  value={entry.validity_days}
                  onChange={(event) =>
                    updateEntry(id, {
                      validity_days: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-warning-days`}>Warn before (days)</Label>
                <Input
                  id={`${id}-warning-days`}
                  type="number"
                  min={1}
                  max={365}
                  value={entry.warning_days}
                  onChange={(event) =>
                    updateEntry(id, {
                      warning_days: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-generated-at`}>Generated at</Label>
                <Input
                  id={`${id}-generated-at`}
                  type="datetime-local"
                  value={isoToLocalInput(entry.generated_at)}
                  onChange={(event) =>
                    updateEntry(id, {
                      generated_at: localInputToIso(event.target.value),
                    })
                  }
                />
                {errors[`${errorPrefix}.generated_at`] ? (
                  <p className="text-xs text-destructive">
                    {errors[`${errorPrefix}.generated_at`]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-expires-at`}>Expires at</Label>
                <Input
                  id={`${id}-expires-at`}
                  type="datetime-local"
                  value={isoToLocalInput(entry.expires_at)}
                  onChange={(event) =>
                    updateEntry(id, {
                      expires_at: localInputToIso(event.target.value),
                    })
                  }
                />
                {errors[`${errorPrefix}.expires_at`] ? (
                  <p className="text-xs text-destructive">
                    {errors[`${errorPrefix}.expires_at`]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor={`${id}-source-url`}>Rotation source URL</Label>
                <Input
                  id={`${id}-source-url`}
                  type="url"
                  value={entry.source_url}
                  onChange={(event) =>
                    updateEntry(id, { source_url: event.target.value })
                  }
                  className="font-mono text-xs"
                />
                {errors[`${errorPrefix}.source_url`] ? (
                  <p className="text-xs text-destructive">
                    {errors[`${errorPrefix}.source_url`]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor={`${id}-deployment-url`}>
                  Consumer configuration URL
                </Label>
                <Input
                  id={`${id}-deployment-url`}
                  type="url"
                  value={entry.deployment_url}
                  onChange={(event) =>
                    updateEntry(id, { deployment_url: event.target.value })
                  }
                  className="font-mono text-xs"
                />
                {errors[`${errorPrefix}.deployment_url`] ? (
                  <p className="text-xs text-destructive">
                    {errors[`${errorPrefix}.deployment_url`]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor={`${id}-notes`}>Rotation notes</Label>
                <Textarea
                  id={`${id}-notes`}
                  value={entry.notes ?? ""}
                  onChange={(event) =>
                    updateEntry(id, { notes: event.target.value })
                  }
                  rows={3}
                />
              </div>
            </div>
          </article>
        );
      })}

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="new-credential-maintenance-id">
            New credential ID
          </Label>
          <Input
            id="new-credential-maintenance-id"
            value={newId}
            placeholder="provider-credential"
            onChange={(event) => {
              setNewId(event.target.value);
              setNewIdError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCredential();
              }
            }}
            className="font-mono"
          />
          {newIdError ? (
            <p className="text-xs text-destructive">{newIdError}</p>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={addCredential}>
          <Plus className="mr-1.5 h-4 w-4" /> Add credential
        </Button>
      </div>
    </div>
  );
}
