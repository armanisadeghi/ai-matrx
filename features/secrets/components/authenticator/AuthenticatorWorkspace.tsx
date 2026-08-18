"use client";

/**
 * Matrx Authenticator — the general-availability manage surface.
 *
 * Enroll + manage + consent ONLY (D-15). There is deliberately NO code shown
 * anywhere on this surface and no "reveal" — a rotating code is never displayed
 * to a human or a model. Generation happens server-side and types the code
 * straight into the page during an agent login; nothing here can read it.
 *
 * `(core)` body contract: `h-full overflow-hidden` with the scroll container
 * inside (features/shell/components/header/variants/USAGE.md).
 */

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Plus,
  Trash2,
  ExternalLink,
  KeyRound,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAuthenticator } from "../../hooks/use-authenticator";
import type { AuthenticatorEntry } from "../../authenticator-types";
import { AuthenticatorEnrollDialog } from "./AuthenticatorEnrollDialog";

function EntryCard({
  entry,
  busy,
  onToggle,
  onDelete,
}: {
  entry: AuthenticatorEntry;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const title =
    entry.issuer || entry.label || entry.display_name || "Authenticator";
  const origin = entry.login_urls[0];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-md bg-muted p-2 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-foreground">{title}</p>
              <Badge variant={entry.enabled ? "default" : "secondary"}>
                {entry.enabled ? "On" : "Off"}
              </Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {entry.display_name}
              {entry.label && entry.label !== title ? ` · ${entry.label}` : ""}
            </p>
            {origin ? (
              <a
                href={origin}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {origin}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {entry.digits} digits · {entry.period}s · {entry.algorithm}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Enabled</span>
            <Switch
              checked={entry.enabled}
              disabled={busy}
              onCheckedChange={onToggle}
              aria-label={`Turn authenticator ${entry.enabled ? "off" : "on"} for ${title}`}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={onDelete}
            aria-label={`Delete authenticator for ${title}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <Link
          href="/vault"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View credential in Vault
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

export function AuthenticatorWorkspace() {
  const { entries, enrollable, loading, busy, error, actions } =
    useAuthenticator();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AuthenticatorEntry | null>(
    null,
  );

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full min-h-0 overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Authenticator
                </h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Matrx can produce the rotating six-digit codes for accounts you
                  enroll here, so it can sign in on your behalf without
                  interrupting you. Codes are never shown — they are typed
                  straight into the sign-in page.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setEnrollOpen(true)}
              disabled={busy}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add authenticator
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Deleting an authenticator here does not remove two-factor from the
              account at the website — your phone app and backup codes still
              work. Keep those somewhere we do not hold them.
            </p>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Spinner className="h-5 w-5" />
              <span className="text-sm">Loading authenticators…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">
                No authenticators yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add one to a saved website login and Matrx can complete its
                six-digit code step for you.
              </p>
              <Button
                className="mt-4 gap-1.5"
                onClick={() => setEnrollOpen(true)}
                disabled={busy}
              >
                <Plus className="h-4 w-4" />
                Add authenticator
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.credential_item_id}
                  entry={entry}
                  busy={busy}
                  onToggle={(enabled) =>
                    actions.setEnabled(entry.credential_item_id, enabled)
                  }
                  onDelete={() => setPendingDelete(entry)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AuthenticatorEnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        enrollable={enrollable}
        busy={busy}
        onEnroll={actions.enroll}
        onEnrollQr={actions.enrollFromQr}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this authenticator?"
        description="Matrx will stop producing codes for this account immediately. Two-factor stays on at the website — your phone app and backup codes still work. Re-enrolling later needs the setup key again."
        confirmLabel="Delete secret"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await actions.remove(pendingDelete.credential_item_id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
