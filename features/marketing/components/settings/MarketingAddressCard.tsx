"use client";

/**
 * The URL-key rename affordance — ONE card for every marketing address
 * (brand today, website today, anything keyed tomorrow).
 *
 * THE RULE (Arman-ratified, 2026-08-30): a rename NEVER breaks the old
 * address. The service writes the old key into `previous_slugs`, the resolvers
 * fall back to it, and the canonicalizing layer forwards the old URL to the new
 * one — so the confirmation says exactly that, in the user's words, before the
 * click lands (THE DESTRUCTIVE/EXPENSIVE-CLICK LAW: state the consequence, not
 * "are you sure?").
 */

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Link2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  marketingKeyProblem,
  pathWithMarketingSegment,
} from "@/features/marketing/lib/keys";

export interface MarketingAddressCardProps {
  /** Card heading — "Brand address" / "Website address". */
  title: string;
  /** One line under the address explaining what it controls. */
  description: string;
  /** Everything before the key, with a trailing slash (`/marketing/`). */
  addressPrefix: string;
  /** The key as it appears in the URL right now. */
  currentKey: string;
  /** Old keys that still forward here — shown so the promise is visible. */
  previousKeys: readonly string[];
  /** Performs the rename; resolves to the key the row now carries. */
  rename: (nextKey: string) => Promise<{ slug: string | null }>;
  /** Called after a successful rename, before the URL is swapped. */
  onRenamed?: () => void;
  /**
   * Where to start looking for `currentKey` in the pathname when swapping the
   * URL — 2 for a brand (`/marketing/<key>`), deeper for a nested entity.
   */
  segmentSearchFrom?: number;
  /** Extra classes for the section wrapper (grid placement). */
  className?: string;
}

export function MarketingAddressCard({
  title,
  description,
  addressPrefix,
  currentKey,
  previousKeys,
  rename,
  onRenamed,
  segmentSearchFrom = 2,
  className,
}: MarketingAddressCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentKey);
  const [confirming, setConfirming] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);

  const candidate = draft.trim().toLowerCase();
  const formatProblem = editing ? marketingKeyProblem(candidate) : null;
  const unchanged = candidate === currentKey;
  const problem = serverProblem ?? formatProblem;

  const renameMutation = useMutation({
    mutationFn: () => rename(candidate),
    onSuccess: (row) => {
      const nextKey = row.slug ?? candidate;
      setConfirming(false);
      setEditing(false);
      setServerProblem(null);
      onRenamed?.();
      toast.success(`Address changed to ${addressPrefix}${nextKey}`, {
        description: `${addressPrefix}${currentKey} keeps working and forwards here.`,
      });
      router.replace(
        pathWithMarketingSegment(
          pathname,
          currentKey,
          nextKey,
          segmentSearchFrom,
        ),
      );
    },
    onError: (error) => {
      setConfirming(false);
      setServerProblem(extractErrorMessage(error));
    },
  });

  const startEditing = () => {
    setDraft(currentKey);
    setServerProblem(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft(currentKey);
    setServerProblem(null);
  };

  return (
    <section className={`rounded-lg border border-border bg-card ${className ?? ""}`}>
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Link2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {!editing ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            onClick={startEditing}
          >
            <Pencil className="h-3.5 w-3.5" />
            Change
          </Button>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        {editing ? (
          <div className="space-y-1.5">
            <Label htmlFor="marketing-address-key" className="text-xs">
              New address
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {addressPrefix}
              </span>
              <Input
                id="marketing-address-key"
                className="h-8 w-56 font-mono text-xs"
                autoFocus
                spellCheck={false}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setServerProblem(null);
                }}
                aria-invalid={Boolean(problem)}
              />
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={Boolean(formatProblem) || unchanged}
                onClick={() => setConfirming(true)}
              >
                <Check className="h-3.5 w-3.5" />
                Change address
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5"
                onClick={cancelEditing}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
            {problem ? (
              <p className="text-[11px] text-destructive">{problem}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers and hyphens. The old address keeps
                working.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
            {addressPrefix}
            <span className="font-semibold text-foreground">{currentKey}</span>
          </div>
        )}
        <p className="text-[11px] leading-4 text-muted-foreground">
          {description}
        </p>
        {previousKeys.length ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Still forwarding here:{" "}
            <span className="font-mono">
              {previousKeys.map((key) => `${addressPrefix}${key}`).join(", ")}
            </span>
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!renameMutation.isPending) setConfirming(open);
        }}
        title="Change this address?"
        description={`The address changes to ${addressPrefix}${candidate}. Links to ${addressPrefix}${currentKey} keep working and forward here.`}
        confirmLabel="Change address"
        busy={renameMutation.isPending}
        onConfirm={async () => {
          try {
            await renameMutation.mutateAsync();
          } catch {
            // Reported inline by the mutation's onError — the dialog must not
            // reject, or the failure escapes as an unhandled rejection.
          }
        }}
      />
    </section>
  );
}
