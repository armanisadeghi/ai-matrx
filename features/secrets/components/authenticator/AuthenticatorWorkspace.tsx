"use client";

/**
 * Matrx Authenticator — the general-availability manage surface.
 *
 * The signed-in owner's authenticator: enroll, show rotating codes, manage,
 * consent, and revoke. Seeds remain sealed and never reach this surface.
 *
 * `(core)` body contract: `h-full overflow-hidden` with the scroll container
 * inside (features/shell/components/header/variants/USAGE.md).
 */

import { useState } from "react";
import Link from "next/link";
import {
  EllipsisVertical,
  ExternalLink,
  Globe,
  Plus,
  Power,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceFavicon } from "@/features/research/components/results/SourceFavicon";
import { useAuthenticator } from "../../hooks/use-authenticator";
import type { AuthenticatorEntry } from "../../authenticator-types";
import { safeVaultLoginUrl } from "../../utils";
import { AuthenticatorEnrollDialog } from "./AuthenticatorEnrollDialog";
import { AuthenticatorCode } from "./AuthenticatorCode";

/** `totp_label` holds the URI's raw `Issuer:account` path. Show the account
 *  alone when the issuer is already the card's title — nobody wants to read
 *  "GitHub · GitHub:me@example.com". */
function accountLabel(entry: AuthenticatorEntry): string | null {
  const label = entry.label?.trim();
  if (!label) return null;
  const idx = label.indexOf(":");
  if (idx === -1) return label;
  const prefix = label.slice(0, idx).trim();
  const rest = label.slice(idx + 1).trim();
  if (!rest) return label;
  return prefix.toLowerCase() === (entry.issuer ?? "").trim().toLowerCase()
    ? rest
    : label;
}

function EntryRow({
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
  const account = accountLabel(entry);
  const safeLoginUrl = entry.login_urls
    .map(safeVaultLoginUrl)
    .find((url) => url !== null);
  const hostname = safeLoginUrl
    ? new URL(safeLoginUrl).hostname.replace(/^www\./, "")
    : null;
  const subtitle = [entry.display_name, account]
    .find(
      (part) =>
        part && part.trim().toLowerCase() !== title.trim().toLowerCase(),
    )
    ?.trim();
  const vaultHref = `/vault?item=${encodeURIComponent(entry.credential_item_id)}`;

  return (
    <div className="grid min-h-28 grid-cols-[44px_minmax(0,1fr)_44px] items-start gap-x-3 border-b border-border px-4 py-3 sm:min-h-20 sm:grid-cols-[44px_minmax(0,1fr)_auto_44px] sm:items-center sm:px-5">
      <SourceFavicon
        hostname={hostname}
        className="h-11 w-11 border border-border p-1.5"
        iconClassName="h-5 w-5"
      />

      <div className="min-w-0 self-center">
        <Link
          href={vaultHref}
          className="block truncate text-base font-semibold leading-5 text-foreground hover:text-primary hover:underline"
        >
          {title}
        </Link>
        {subtitle ? (
          <p className="mt-0.5 truncate text-sm leading-5 text-muted-foreground">
            {subtitle}
          </p>
        ) : hostname ? (
          <p className="mt-0.5 truncate text-sm leading-5 text-muted-foreground">
            {hostname}
          </p>
        ) : null}
      </div>

      <div className="col-start-2 mt-2 min-w-0 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:min-w-52">
        <AuthenticatorCode
          credentialItemId={entry.credential_item_id}
          enabled={entry.enabled}
          period={entry.period}
          presentation="compact"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            className="col-start-3 row-start-1 h-11 w-11 sm:col-start-4"
            aria-label={`Manage ${title}`}
          >
            <EllipsisVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem asChild className="h-11 gap-2">
            <Link href={vaultHref}>
              <Globe className="h-4 w-4" />
              Open in Vault
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="h-11 gap-2">
            <Link href={vaultHref} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="h-11 gap-2"
            onSelect={() => onToggle(!entry.enabled)}
          >
            <Power className="h-4 w-4" />
            Turn {entry.enabled ? "off" : "on"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-11 gap-2 text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete authenticator
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AuthenticatorListSkeleton() {
  return (
    <div aria-label="Loading authenticators">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid min-h-28 grid-cols-[44px_minmax(0,1fr)_44px] gap-x-3 border-b border-border px-4 py-3 sm:min-h-20 sm:grid-cols-[44px_minmax(0,1fr)_auto_44px] sm:items-center sm:px-5"
        >
          <Skeleton className="h-11 w-11 rounded-md" />
          <div className="space-y-2 py-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="mt-3 h-8 w-44 sm:hidden" />
          </div>
          <Skeleton className="hidden h-9 w-48 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function AuthenticatorWorkspace() {
  const { entries, enrollable, loading, busy, error, refresh, actions } =
    useAuthenticator();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AuthenticatorEntry | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) =>
        [entry.issuer, entry.label, entry.display_name]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery)),
      )
    : entries;

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full min-h-0 overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-auto w-full max-w-5xl pb-safe sm:px-6 sm:py-5">
          <div className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-2 sm:rounded-t-xl sm:border sm:bg-card sm:px-5">
            {entries.length >= 5 ? (
              <div className="relative min-w-0 flex-1">
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search authenticators"
                  aria-label="Search authenticators"
                  className="h-11 bg-muted/60 pl-10 text-base"
                  style={{ fontSize: "16px" }}
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">
                  {loading
                    ? "Your codes"
                    : `${entries.length} ${entries.length === 1 ? "authenticator" : "authenticators"}`}
                </p>
              </div>
            )}
            <Button
              onClick={() => setEnrollOpen(true)}
              disabled={busy}
              variant="outline"
              className="h-11 shrink-0 gap-1.5 px-3"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {error ? (
            <div className="flex items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:border-x">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : null}

          {loading ? (
            <div className="sm:rounded-b-xl sm:border-x sm:border-b sm:bg-card">
              <AuthenticatorListSkeleton />
            </div>
          ) : entries.length === 0 ? (
            <div className="px-5 py-14 text-center sm:rounded-b-xl sm:border-x sm:border-b sm:bg-card">
              <p className="font-medium text-foreground">No codes yet</p>
              <Button
                className="mt-4 h-11 gap-1.5"
                onClick={() => setEnrollOpen(true)}
                disabled={busy}
              >
                <Plus className="h-4 w-4" />
                Add authenticator
              </Button>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-muted-foreground sm:rounded-b-xl sm:border-x sm:border-b sm:bg-card">
              No authenticators match “{query}”.
            </div>
          ) : (
            <div className="sm:overflow-hidden sm:rounded-b-xl sm:border-x sm:border-b sm:bg-card">
              {visibleEntries.map((entry) => (
                <EntryRow
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
