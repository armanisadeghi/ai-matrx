"use client";

/**
 * features/files/cache/admin/BlobCacheInspector.tsx
 *
 * Super-Admin observability panel for the 3-tier byte cache:
 *   L1 — in-memory LRU                  (`hooks/blob-cache.ts`)
 *   L2 — IndexedDB persistent           (`cache/idb-store.ts`)
 *   L3 — Service Worker URL interceptor (`public/blob-sw.js`)
 *
 * What this is for
 * ────────────────
 * When a PDF previews instantly on first open it should be because L1
 * is warm. When it previews instantly across a refresh it should be
 * because L2 is warm. When it previews instantly across a hard reload
 * it should be because the SW returned 206 from L2. If any of those
 * stop working the user-visible symptom is "huh, that's slower than
 * yesterday" — there's no error, just lost speed. This panel makes the
 * cache's working set legible so we can confirm each tier is actually
 * doing its job.
 *
 * It also gives Super Admins the controls to wipe the local cache
 * during an incident (e.g. corrupted blob served from L2 on one
 * machine) without falling back to "open DevTools and clear IDB by
 * hand."
 *
 * Routed at `/administration/blob-cache`. Mounted under (admin-auth)
 * which already gates on Super Admin; the page re-checks via
 * `selectIsSuperAdmin` so the redirect-races a slow boot.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  HardDrive,
  Layers,
  Loader2,
  RefreshCw,
  ServerCog,
  Trash2,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  getCacheStats,
  invalidateAll,
} from "@/features/files/hooks/blob-cache";
import {
  getStats as getIdbStats,
  clearForUser,
  evictForUser,
  DEFAULT_BUDGET_BYTES,
} from "@/features/files/cache/idb-store";
import { postBlobCacheClearUser } from "@/features/files/cache/register-service-worker";
import { formatFileSize } from "@/features/files";

interface L1Stats {
  entryCount: number;
  totalBytes: number;
  budgetBytes: number;
}

interface L2Stats {
  entryCount: number;
  totalBytes: number;
}

type SwStatus =
  | { kind: "unsupported" }
  | { kind: "disabled" }
  | { kind: "registering" }
  | { kind: "registered"; scope: string; controllerState: string };

export function BlobCacheInspector() {
  const userId = useAppSelector(selectUserId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  const [l1, setL1] = useState<L1Stats | null>(null);
  const [l2, setL2] = useState<L2Stats | null>(null);
  const [sw, setSw] = useState<SwStatus>({ kind: "registering" });
  const [refreshing, setRefreshing] = useState(false);
  const [busyOp, setBusyOp] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setL1(getCacheStats());
      const idbStats = await getIdbStats();
      setL2(idbStats);

      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        setSw({ kind: "unsupported" });
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/blob-sw.js");
        if (!reg) {
          setSw({ kind: "disabled" });
        } else {
          const worker = reg.active ?? reg.waiting ?? reg.installing;
          setSw({
            kind: "registered",
            scope: reg.scope,
            controllerState: worker?.state ?? "unknown",
          });
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 5_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // ── Mutations ──────────────────────────────────────────────────────

  const handleClearMemory = useCallback(() => {
    if (!userId) return;
    setBusyOp("clear-memory");
    try {
      // invalidateAll without a userId only wipes memory; passing the
      // userId also wipes L2 and the SW. We only want L1 here.
      invalidateAll();
      toast.success("Cleared in-memory cache (L1).");
      void refresh();
    } finally {
      setBusyOp(null);
    }
  }, [userId, refresh]);

  const handleClearIdb = useCallback(async () => {
    if (!userId) return;
    const ok = await confirm({
      title: "Clear IndexedDB cache?",
      description:
        "Drops every cached blob for the current user from L2. Next file open " +
        "will re-download from the backend. The Service Worker mappings stay " +
        "intact (re-cache transparently as files are re-fetched).",
      confirmLabel: "Clear L2",
      variant: "destructive",
    });
    if (!ok) return;
    setBusyOp("clear-idb");
    try {
      await clearForUser(userId);
      toast.success("Cleared IndexedDB cache (L2).");
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? `Clear failed: ${err.message}` : "Clear failed",
      );
    } finally {
      setBusyOp(null);
    }
  }, [userId, refresh]);

  const handleClearAll = useCallback(async () => {
    if (!userId) return;
    const ok = await confirm({
      title: "Wipe all cache tiers?",
      description:
        "Drops L1 (memory), L2 (IndexedDB), and tells the Service Worker to " +
        "forget every cached blob for the current user. The next open of any " +
        "file re-downloads from the backend. Use this when responding to a " +
        "stale-bytes incident.",
      confirmLabel: "Wipe all tiers",
      variant: "destructive",
    });
    if (!ok) return;
    setBusyOp("clear-all");
    try {
      invalidateAll(userId);
      await postBlobCacheClearUser(userId);
      toast.success("Wiped all cache tiers.");
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? `Wipe failed: ${err.message}` : "Wipe failed",
      );
    } finally {
      setBusyOp(null);
    }
  }, [userId, refresh]);

  const handleEvictHalf = useCallback(async () => {
    if (!userId || !l2) return;
    const target = Math.floor(l2.totalBytes / 2);
    setBusyOp("evict-half");
    try {
      await evictForUser(userId, target);
      toast.success(`Evicted to ${formatFileSize(target)}.`);
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Evict failed: ${err.message}`
          : "Evict failed",
      );
    } finally {
      setBusyOp(null);
    }
  }, [userId, l2, refresh]);

  const handleUnregisterSw = useCallback(async () => {
    const ok = await confirm({
      title: "Unregister Service Worker?",
      description:
        "Drops the registration so future page loads won't intercept byte " +
        "fetches. The next refresh re-registers if config allows. Use only " +
        "to debug SW-side issues.",
      confirmLabel: "Unregister",
      variant: "destructive",
    });
    if (!ok) return;
    setBusyOp("unregister-sw");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/blob-sw.js");
      if (reg) {
        await reg.unregister();
        toast.success("Service Worker unregistered.");
      } else {
        toast.info("No Service Worker was registered.");
      }
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Unregister failed: ${err.message}`
          : "Unregister failed",
      );
    } finally {
      setBusyOp(null);
    }
  }, [refresh]);

  // ── Guard ──────────────────────────────────────────────────────────

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Super Admin access required.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Blob Cache Observability
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            3-tier byte cache health for the current user. Stats refresh every
            5s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      {!userId && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          No signed-in user — IDB and SW operate per-identity and can't be
          inspected anonymously.
        </div>
      )}

      {/* L1 — memory ----------------------------------------------------- */}
      <TierCard
        icon={<HardDrive className="h-4 w-4 text-blue-500" />}
        title="L1 — In-memory LRU"
        subtitle="Per-tab cache. Owns the active blob: URLs. Wiped on tab close."
      >
        {l1 ? (
          <Stats
            rows={[
              ["Entries", String(l1.entryCount)],
              ["Used", formatFileSize(l1.totalBytes)],
              ["Budget", formatFileSize(l1.budgetBytes)],
              [
                "Utilisation",
                `${Math.round((l1.totalBytes / Math.max(1, l1.budgetBytes)) * 100)}%`,
              ],
            ]}
          />
        ) : (
          <SkeletonRows />
        )}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearMemory}
            disabled={!userId || busyOp === "clear-memory"}
          >
            {busyOp === "clear-memory" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Clear memory
          </Button>
        </div>
      </TierCard>

      {/* L2 — IndexedDB -------------------------------------------------- */}
      <TierCard
        icon={<Database className="h-4 w-4 text-purple-500" />}
        title="L2 — IndexedDB persistent"
        subtitle="Survives reloads + tab close. Identity-scoped. Default budget 2 GB."
      >
        {l2 ? (
          <Stats
            rows={[
              ["Entries", String(l2.entryCount)],
              ["Used", formatFileSize(l2.totalBytes)],
              ["Budget", formatFileSize(DEFAULT_BUDGET_BYTES)],
              [
                "Utilisation",
                `${Math.round(
                  (l2.totalBytes / Math.max(1, DEFAULT_BUDGET_BYTES)) * 100,
                )}%`,
              ],
            ]}
          />
        ) : (
          <SkeletonRows />
        )}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEvictHalf}
            disabled={
              !userId || !l2 || l2.totalBytes === 0 || busyOp === "evict-half"
            }
          >
            {busyOp === "evict-half" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Layers className="h-3.5 w-3.5 mr-1.5" />
            )}
            Evict to 50%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearIdb}
            disabled={!userId || busyOp === "clear-idb"}
          >
            {busyOp === "clear-idb" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Clear L2
          </Button>
        </div>
      </TierCard>

      {/* L3 — Service Worker -------------------------------------------- */}
      <TierCard
        icon={<ServerCog className="h-4 w-4 text-green-500" />}
        title="L3 — Service Worker"
        subtitle="Intercepts /files/{id}/download + share links. Serves 206 from L2 cache."
      >
        <SwStatusRows status={sw} />
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnregisterSw}
            disabled={
              sw.kind !== "registered" || busyOp === "unregister-sw"
            }
          >
            {busyOp === "unregister-sw" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Unregister SW
          </Button>
        </div>
      </TierCard>

      {/* Global controls ------------------------------------------------- */}
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-destructive">
            Wipe all tiers
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use during a stale-bytes incident. Drops L1, L2, and tells the SW
            to forget every cached blob for this user.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleClearAll}
          disabled={!userId || busyOp === "clear-all"}
        >
          {busyOp === "clear-all" ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          )}
          Wipe all
        </Button>
      </div>
    </div>
  );
}

// ── Presentational helpers ─────────────────────────────────────────────

function TierCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Stats({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md border border-border/60 bg-background/60 px-3 py-2"
        >
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="text-sm font-medium tabular-nums mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SkeletonRows() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-border/60 bg-background/60 px-3 py-2"
        >
          <div className="h-2.5 w-12 bg-muted animate-pulse rounded" />
          <div className="h-4 w-16 bg-muted animate-pulse rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

function SwStatusRows({ status }: { status: SwStatus }) {
  if (status.kind === "registering") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking…
      </div>
    );
  }
  if (status.kind === "unsupported") {
    return (
      <StatusPill
        tone="warn"
        label="Service Workers unsupported in this browser"
      />
    );
  }
  if (status.kind === "disabled") {
    return (
      <StatusPill
        tone="warn"
        label="No registration — disabled in dev or registration failed"
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <StatusPill tone="ok" label="Active" />
      <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          State
        </div>
        <div className="text-sm font-medium mt-0.5">
          {status.controllerState}
        </div>
      </div>
      <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2 sm:col-span-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Scope
        </div>
        <div className="text-xs font-mono mt-0.5 break-all">{status.scope}</div>
      </div>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "ok" | "warn"; label: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        tone === "ok"
          ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {tone === "ok" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      {label}
    </div>
  );
}
