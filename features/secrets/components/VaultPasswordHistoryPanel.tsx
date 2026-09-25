"use client";

/**
 * Personal password history is deliberately a separate, metadata-first panel.
 * It cannot be reached for shared or organization credentials and values stay
 * only in this mounted component's transient holder.
 */
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, History, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";

import { useTransientSecret } from "../vault-hooks";
import {
  fetchVaultPasswordHistory,
  revealVaultPasswordHistory,
  VaultRecentAuthRequiredError,
} from "../vault-service";
import type { VaultField, VaultPasswordHistoryResponse } from "../types";
import { VaultRevealReauthDialog } from "./SecretValue";

type Props = {
  itemId: string;
  field: VaultField;
  currentUserId: string | null;
};

export function VaultPasswordHistoryPanel({
  itemId,
  field,
  currentUserId,
}: Props) {
  const [history, setHistory] = useState<VaultPasswordHistoryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingRevision, setWorkingRevision] = useState<number | null>(null);
  const [revealedRevision, setRevealedRevision] = useState<number | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const secret = useTransientSecret();
  const generation = useRef(0);
  const revealedIdentity = useRef<string | null>(null);
  const authenticatedActorId = useRef<string | null | undefined>(undefined);
  const identity = `${itemId}:${field.id}:${field.value_version}:${currentUserId ?? ""}`;
  const identityRef = useRef(identity);

  if (identityRef.current !== identity) {
    identityRef.current = identity;
    generation.current += 1;
    secret.clear();
    revealedIdentity.current = null;
    setLoadingMore(false);
  }

  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHistory(null);
    void fetchVaultPasswordHistory(itemId)
      .then(
        (result) => {
          if (generation.current !== request) return;
          setHistory(result);
        },
        () => {
          if (generation.current !== request) return;
          setError(
            "Password history is unavailable right now. Try again shortly.",
          );
        },
      )
      .finally(() => {
        if (generation.current === request) setLoading(false);
      });
    return () => {
      generation.current += 1;
      secret.clear();
      revealedIdentity.current = null;
    };
  }, [itemId, field.id, identity, secret.clear]);

  useEffect(() => {
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event, session) => {
      const nextActorId = session?.user.id ?? null;
      const previousActorId = authenticatedActorId.current;
      authenticatedActorId.current = nextActorId;
      // Supabase emits INITIAL_SESSION immediately after subscription. It
      // confirms the same identity that mounted this panel; treating it as a
      // revocation discards the only metadata request and leaves Loading on
      // screen forever. A later sign-out or a different account still fences
      // every pending request and clears revealed plaintext synchronously.
      if (
        (previousActorId === undefined &&
          event === "INITIAL_SESSION" &&
          nextActorId === currentUserId) ||
        (previousActorId === nextActorId && event !== "SIGNED_OUT")
      )
        return;
      generation.current += 1;
      secret.clear();
      revealedIdentity.current = null;
      setWorkingRevision(null);
      setLoadingMore(false);
      setLoading(false);
      setError("Your account changed. Reopen this credential from the Vault.");
    });
    return () => subscription.unsubscribe();
  }, [currentUserId, secret.clear]);

  const reveal = async (revision: number) => {
    const request = ++generation.current;
    setWorkingRevision(revision);
    try {
      const result = await revealVaultPasswordHistory(
        itemId,
        field.id,
        revision,
      );
      if (
        generation.current !== request ||
        result.item_id !== itemId ||
        result.field_id !== field.id ||
        result.revision !== revision
      )
        return;
      secret.hold(result.value);
      revealedIdentity.current = identity;
      setRevealedRevision(revision);
    } catch (cause) {
      if (generation.current !== request) return;
      if (cause instanceof VaultRecentAuthRequiredError) setReauthOpen(true);
      else
        toast.error(
          "That prior password is no longer available. Refresh the timeline and try again.",
        );
    } finally {
      if (generation.current === request) setWorkingRevision(null);
    }
  };

  const loadMore = async () => {
    const beforeRevision = history?.next_before_revision;
    if (!beforeRevision || loadingMore) return;
    const request = ++generation.current;
    setLoadingMore(true);
    try {
      const next = await fetchVaultPasswordHistory(itemId, beforeRevision);
      if (generation.current !== request) return;
      setHistory((current) =>
        current
          ? {
              ...next,
              entries: [...current.entries, ...next.entries],
              count: current.entries.length + next.entries.length,
              omitted_count: current.omitted_count + next.omitted_count,
              incomplete:
                next.incomplete ||
                current.omitted_count + next.omitted_count > 0,
            }
          : next,
      );
    } catch {
      if (generation.current === request)
        toast.error(
          "Earlier password history is unavailable right now. Try again shortly.",
        );
    } finally {
      if (generation.current === request) setLoadingMore(false);
    }
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-muted/25 p-3"
      aria-label="Password history"
    >
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Password history</h3>
          <p className="text-xs text-muted-foreground">
            This timeline lists recorded password changes without loading an old
            value.
          </p>
        </div>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading password history…
        </p>
      ) : error ? (
        <p className="text-xs text-muted-foreground">{error}</p>
      ) : history?.entries.length === 0 ? (
        <div className="rounded-md bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          No captured password states yet.{" "}
          {history?.capture_cutoff_at
            ? `History began ${new Date(history.capture_cutoff_at).toLocaleString()}; earlier values are unavailable.`
            : "History has not recorded a password state for this credential; earlier values are unavailable."}
        </div>
      ) : (
        <ul className="space-y-2">
          {history?.entries.map((entry) => {
            const valueAvailable =
              history.value_availability !== "unavailable" &&
              entry.value_availability !== "unavailable";
            const showing =
              secret.value !== null &&
              revealedRevision === entry.revision &&
              revealedIdentity.current === identity;
            const working = workingRevision === entry.revision;
            return (
              <li
                key={`${entry.field_id}:${entry.revision}`}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-medium">Password change</span>
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {new Date(entry.recorded_at).toLocaleString()}
                    </span>
                  </div>
                  {valueAvailable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={working}
                      onClick={() => {
                        if (showing) {
                          secret.clear();
                          revealedIdentity.current = null;
                          setRevealedRevision(null);
                        } else void reveal(entry.revision);
                      }}
                    >
                      {working ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : showing ? (
                        <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {showing ? "Hide" : "Show old password"}
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Old value unavailable
                    </span>
                  )}
                </div>
                {showing && (
                  <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                    {secret.value}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {history?.capture_cutoff_at && history.entries.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          History is available only from{" "}
          {new Date(history.capture_cutoff_at).toLocaleString()}. Earlier
          passwords were not captured.
        </p>
      )}
      {history?.next_before_revision && (
        <Button
          size="sm"
          variant="outline"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Load earlier changes
        </Button>
      )}
      {(history?.omitted_count ?? 0) > 0 && (
        <p className="flex gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Some recorded changes are unavailable, so this timeline is incomplete.
        </p>
      )}
      <VaultRevealReauthDialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
      />
    </section>
  );
}
