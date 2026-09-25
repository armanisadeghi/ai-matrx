"use client";

/**
 * Trash — one page for everything the user has soft-deleted, anywhere, AND the
 * one place that answers "when does this actually go away?".
 *
 * Not a per-feature trash, and not two surfaces. Both trash RPCs iterate
 * `platform.entity_types.user_artifact_kind`, so a newly registered user-facing
 * entity appears here with no change to this file; the lifecycle half reads
 * `platform.lifecycle_user_notice()`, the SAME function the weekly digest email
 * reads, so the page can never contradict the email.
 *
 * 🚨 The lifecycle sections render ONLY when the user actually has something
 * pending or archived. With the platform retention floor at `never` — which is
 * where it sits today — every entity resolves to `never`, the notice comes back
 * empty, and this page looks exactly as it did before lifecycle existed. That
 * is the common case and it must stay pixel-identical.
 *
 * No "delete permanently" button: destruction is the retention engine's job
 * (common-docs/projects/data-lifecycle-platform), never an impulse click.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Clock, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  isVaultCredentialTrashItem,
  isVaultOwnedTrashToken,
  previewVaultRecovery,
  type TrashCount,
  type TrashItem,
  type VaultRecoveryPreview,
} from "@/features/trash/service";
import { TrashList } from "@/features/trash/components/TrashList";
import { VaultTrashRestoreDialog } from "@/features/trash/VaultTrashRestoreDialog";
import {
  getVaultExportActor,
  type VaultVerifiedExportActor,
} from "@/features/secrets/vault-service";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { createClient } from "@/utils/supabase/client";
import {
  fetchLifecycleNotice,
  keepPendingEntity,
  type LifecycleArchived,
  type LifecycleNotice,
  type LifecyclePending,
} from "@/features/trash/lifecycleService";
import {
  itemCount,
  groupScheduleText,
  isScheduleOverdue,
  lifecycleLabel,
  longDate,
  whenPhrase,
} from "@/features/trash/labels";

/**
 * One group of the user's rows with a wipe date.
 *
 * `wipe_on` is the SOONEST wipe in the group, not a date shared by every row —
 * so a group of many says "the first of these", which is what the number
 * actually means. Saying "all of these go on X" would be a lie for every row
 * deleted later than the oldest.
 */
function PendingGroup({
  item,
  busy,
  restoreIndividually,
  noticeAsOf,
  onKeep,
}: {
  item: LifecyclePending;
  busy: boolean;
  restoreIndividually: boolean;
  noticeAsOf: string | null;
  onKeep: () => void;
}) {
  const label = lifecycleLabel(item.entity_token, item.label);
  const soon = item.in_warning_window;
  const schedule = groupScheduleText({
    wipeOn: item.wipe_on,
    asOf: noticeAsOf,
    daysLeft: item.days_left,
    rows: item.rows,
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
        soon
          ? "border-amber-400/60 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30"
          : "border-border bg-card",
      )}
    >
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium">
          {itemCount(item.rows)} — {label}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {schedule}
        </p>
        {soon && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            This group is in its retention warning period.
          </p>
        )}
      </div>
      {restoreIndividually ? (
        <span className="text-muted-foreground shrink-0 self-start text-xs sm:self-auto">
          Restore individually
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 self-start sm:self-auto"
          disabled={busy}
          onClick={onKeep}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          <span className="ml-1.5">{busy ? "Keeping…" : "Keep them all"}</span>
        </Button>
      )}
    </div>
  );
}

function ArchivedGroup({ item }: { item: LifecycleArchived }) {
  const date = longDate(item.archived_on);
  return (
    <div className="border-border bg-card flex items-start gap-3 rounded-lg border p-3">
      <Archive
        className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium">
          {itemCount(item.rows)} — {lifecycleLabel(item.entity_token)}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {date
            ? `Moved to long-term storage on ${date}.`
            : "Moved to long-term storage."}{" "}
          {item.restorable
            ? "Still yours — ask us any time and we'll bring it back."
            : "Already brought back for you."}
        </p>
      </div>
    </div>
  );
}

export default function TrashPage() {
  const organizationId = useAppSelector(selectOrganizationId);
  const [counts, setCounts] = useState<TrashCount[]>([]);
  const [notice, setNotice] = useState<LifecycleNotice | null>(null);
  /** Bumped whenever this page changed what the list shows (Keep all, a Vault recovery). */
  const [listKey, setListKey] = useState(0);
  const [keeping, setKeeping] = useState<string | null>(null);
  const [vaultItem, setVaultItem] = useState<TrashItem | null>(null);
  const [vaultPreview, setVaultPreview] = useState<VaultRecoveryPreview | null>(
    null,
  );
  const [vaultActor, setVaultActor] =
    useState<VaultVerifiedExportActor | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewGeneration = useRef(0);
  const mounted = useRef(true);
  const previewActor = useRef<VaultVerifiedExportActor | null>(null);

  const total = counts.reduce((sum, c) => sum + Number(c.n), 0);

  const pending = notice?.pending ?? [];
  const archived = notice?.archived ?? [];

  /** entity_token → its wipe date, for annotating individual rows. */
  const pendingByToken = useMemo(
    () => new Map(pending.map((p) => [p.entity_token, p])),
    [pending],
  );

  /**
   * The lifecycle notice. A failure here is SILENT on purpose: nothing on this
   * page depends on it, and a retention hiccup must never stop someone from
   * restoring a file.
   */
  const loadNotice = useCallback(async () => {
    try {
      setNotice(await fetchLifecycleNotice());
    } catch (e) {
      console.error("[trash] lifecycle notice unavailable", e);
      setNotice(null);
    }
  }, []);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  const discardVaultRecovery = useCallback(() => {
    previewGeneration.current += 1;
    previewActor.current = null;
    setVaultActor(null);
    setPreviewing(null);
    setVaultItem(null);
    setVaultPreview(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    const actor = previewActor.current;
    if (actor && actor.organizationId !== organizationId) {
      discardVaultRecovery();
    }
  }, [discardVaultRecovery, organizationId]);

  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange(
      (_event, session) => {
        const actor = previewActor.current;
        if (actor && (!session?.user || session.user.id !== actor.userId)) {
          discardVaultRecovery();
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [discardVaultRecovery]);

  /** Vault credentials only — every other kind restores inside <TrashList>. */
  const reviewVaultRecovery = async (item: TrashItem) => {
    const operation = ++previewGeneration.current;
    setPreviewing(item.id);
    try {
      const actor = await getVaultExportActor();
      if (!mounted.current || operation !== previewGeneration.current) return;
      const preview = await previewVaultRecovery(item.id);
      const actual = await getVaultExportActor();
      if (
        !mounted.current ||
        operation !== previewGeneration.current ||
        actor.userId !== actual.userId ||
        actor.organizationId !== actual.organizationId
      ) {
        return;
      }
      previewActor.current = actual;
      setVaultActor(actual);
      setVaultPreview(preview);
      setVaultItem(item);
    } catch (e) {
      if (!mounted.current || operation !== previewGeneration.current) return;
      toast({
        title: "Could not review recovery",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      if (mounted.current && operation === previewGeneration.current) {
        setPreviewing(null);
      }
    }
  };

  /**
   * The BULK escape hatch — "keep everything of this kind". Per-item restore
   * above stays on `entity_undelete`; these are two different scopes and never
   * the same button.
   */
  const keepAll = async (group: LifecyclePending) => {
    if (isVaultOwnedTrashToken(group.entity_token)) {
      toast({
        title: "Restore Vault credentials one at a time",
        description:
          "Vault recovery needs a separate review so restored credentials stay disabled and automatic use stays off.",
        variant: "destructive",
      });
      return;
    }
    const label = lifecycleLabel(group.entity_token, group.label);
    setKeeping(group.entity_token);
    try {
      const res = await keepPendingEntity(group.entity_token);
      toast({
        title:
          res.rows_kept === 0
            ? `Nothing left to keep — ${label} is already staying.`
            : `Keeping ${itemCount(res.rows_kept)}.`,
        description: "Nothing there will be deleted.",
      });
      // Keeping clears `deleted_at`, so those rows leave the trash too.
      await loadNotice();
      setListKey((k) => k + 1);
    } catch (e) {
      toast({
        title: "Could not keep that",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setKeeping(null);
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <span className="flex items-center gap-2 font-medium">
            <Trash2 className="h-4 w-4" />
            Trash
            {total > 0 && (
              <span className="text-muted-foreground text-sm tabular-nums">
                {total.toLocaleString()}
              </span>
            )}
          </span>
        }
      />

      <div
        className="mx-auto w-full max-w-4xl px-4 pb-16"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <p className="text-muted-foreground py-3 text-sm">
          Everything you&apos;ve deleted, in one place. Most items return where
          they were; recovered credentials stay disabled until you deliberately
          reenable them.
        </p>

        {pending.length > 0 && (
          <section className="space-y-2 pb-4">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Scheduled to be deleted for good
              </h2>
              <p className="text-muted-foreground text-sm">
                You deleted these, so they&apos;re on their way out. Changed
                your mind? Keep them and they stay.
              </p>
            </div>
            {pending.map((group) => (
              <PendingGroup
                key={group.entity_token}
                item={group}
                busy={keeping === group.entity_token}
                restoreIndividually={isVaultOwnedTrashToken(group.entity_token)}
                noticeAsOf={notice?.as_of ?? null}
                onKeep={() => void keepAll(group)}
              />
            ))}
          </section>
        )}

        <TrashList
          scope={{
            mode: "personal",
            isVaultItem: isVaultCredentialTrashItem,
            onVaultRestore: (item) => void reviewVaultRecovery(item),
            busyId: previewing,
          }}
          refreshKey={listKey}
          onCounts={setCounts}
          onRestored={() => void loadNotice()}
          rowClassName={(item) =>
            pendingByToken.get(item.entity_token)?.in_warning_window
              ? "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
              : undefined
          }
          renderRowExtra={(item) => {
            const clock = pendingByToken.get(item.entity_token);
            if (!clock) return null;
            const overdue = isScheduleOverdue(clock.wipe_on, notice?.as_of ?? null);
            return (
              <span
                className={cn(
                  "hidden shrink-0 text-xs sm:inline",
                  clock.in_warning_window
                    ? "font-medium text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
                title={
                  longDate(clock.wipe_on)
                    ? `Earliest group schedule: ${longDate(clock.wipe_on)}. Individual rows may have later deadlines.`
                    : undefined
                }
              >
                Group schedule: {overdue ? "eligible for deletion" : whenPhrase(clock.days_left)}
              </span>
            );
          }}
        />

        {archived.length > 0 && (
          <section className="space-y-2 pt-6">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Moved to long-term storage
              </h2>
              <p className="text-muted-foreground text-sm">
                Not deleted — just tucked away so the app stays fast. It&apos;s
                still yours.
              </p>
            </div>
            {archived.map((group) => (
              <ArchivedGroup
                key={`${group.entity_token}-${group.archived_on}`}
                item={group}
              />
            ))}
          </section>
        )}
      </div>
      <VaultTrashRestoreDialog
        key={vaultPreview?.deletion_id ?? vaultItem?.id ?? "no-vault-recovery"}
        item={vaultItem}
        preview={vaultPreview}
        actor={vaultActor}
        open={vaultItem !== null && vaultPreview !== null}
        onOpenChange={(next) => {
          if (!next) {
            discardVaultRecovery();
          }
        }}
        onRestored={(_restored, result) => {
          setListKey((k) => k + 1);
          toast({
            title: result.already_restored
              ? "Credential was already restored"
              : "Credential restored disabled",
            description: result.already_restored
              ? "It remains disabled, with sharing and automatic use off until you deliberately reenable them."
              : "Sharing and automatic use remain off until you deliberately reenable them.",
          });
          void loadNotice();
        }}
      />
    </>
  );
}
