"use client";

// Admin management — Super Admin only.
//
// The (admin) layout requires an admin (checkIsUserAdmin); Super Admin is
// enforced server-side: every API route below requires Super Admin, and
// the underlying SECURITY DEFINER RPCs gate again at the DB layer.
//
// Presentation only: list views are the canonical MatrxDataTable; all
// mutations still go through the SECURITY DEFINER admin RPCs via
// /api/admin/admins/* (protected-resources single path of resistance).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search, ShieldAlert, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  AdminUserRef,
  accountHrefFor,
} from "@/features/admin/users/components/AdminUserRef";
import { DeepLinkMissNotice } from "@/components/official/deep-link/DeepLinkMissNotice";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import { useDeepLinkParam } from "@/components/official/deep-link/useDeepLinkParam";
import type { Database } from "@/types/database.types";

const PAGE_LOCATION =
  "AI Matrx Admin — Admins & Levels (/administration/users/admins)";

type AdminLevel = Database["public"]["Enums"]["admin_level"];

interface AdminRow {
  user_id: string;
  email: string | null;
  level: AdminLevel;
  permissions: Record<string, unknown>;
  metadata: Record<string, unknown>;
  admin_created_at: string;
  user_created_at: string | null;
  last_sign_in_at: string | null;
}

interface AuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: "promote" | "update" | "revoke";
  target_user_id: string;
  target_email: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

interface LookupResult {
  user_id: string;
  email: string;
  is_admin: boolean;
  admin_level: AdminLevel | null;
}

const LEVELS: AdminLevel[] = ["developer", "senior_admin", "super_admin"];

const LEVEL_LABEL: Record<AdminLevel, string> = {
  developer: "Developer",
  senior_admin: "Senior Admin",
  super_admin: "Super Admin",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function adminSummary(row: AdminRow): string {
  return [
    `Email: ${row.email ?? "—"}`,
    `Level: ${LEVEL_LABEL[row.level]}`,
    `User ID: ${row.user_id}`,
    `Promoted: ${formatDate(row.admin_created_at)}`,
    `Last sign-in: ${formatDate(row.last_sign_in_at)}`,
  ].join("\n");
}

function levelBadgeClass(level: AdminLevel) {
  if (level === "super_admin") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  }
  if (level === "senior_admin") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  }
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
}

function auditChange(entry: AuditEntry): string {
  const before = entry.before as { level?: AdminLevel } | null;
  const after = entry.after as { level?: AdminLevel } | null;
  if (entry.action === "promote") {
    return `→ ${after?.level ? LEVEL_LABEL[after.level] : ""}`;
  }
  if (entry.action === "update") {
    if (before?.level && after?.level && before.level !== after.level) {
      return `${LEVEL_LABEL[before.level]} → ${LEVEL_LABEL[after.level]}`;
    }
    return "permissions / metadata";
  }
  return `was ${before?.level ? LEVEL_LABEL[before.level] : "admin"}`;
}

function AdminsManagementPageContent() {
  // `?user=<id>` — the door every surface that names a user now offers
  // ("Admin level"). Accounts linked here for months while this page read no
  // param at all, landing the user on an unfiltered roster while promising a
  // filtered one. The admins search matches user id, so seeding it honours the
  // link with the table's own primitive rather than a second filter.
  const searchParams = useSearchParams();
  const focusedUserId = searchParams.get("user") ?? "";
  const [adminSearch, setAdminSearch] = useState(focusedUserId);
  // Re-seed only when the PARAM changes — never on every render, so typing in
  // the box (or clearing it) is not fought by the deep link that opened it.
  const lastSeededUserId = useRef(focusedUserId);
  useEffect(() => {
    if (lastSeededUserId.current === focusedUserId) return;
    lastSeededUserId.current = focusedUserId;
    setAdminSearch(focusedUserId);
  }, [focusedUserId]);

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [auditFailed, setAuditFailed] = useState(false);

  // The roster loaded and the linked person holds no admin row. Checked against
  // the FULL `admins` list, not the table's filtered view, so a search the user
  // typed themselves can never be mistaken for a missing record.
  const focusMissed = Boolean(
    focusedUserId &&
      !loading &&
      !loadFailed &&
      !admins.some((row) => row.user_id === focusedUserId),
  );

  const { clear: clearUserFocus } = useDeepLinkParam("user");

  // Add-admin form state
  const [emailQuery, setEmailQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<AdminLevel>("developer");
  const [promoteBusy, setPromoteBusy] = useState(false);

  // Per-row update state
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  // The whole body is guarded, not just the !res.ok branch: a rejected fetch
  // (offline, DNS) or a malformed body throws, and an unguarded throw would
  // leave `loadFailed` false while `loading` still ends false — so the deep-link
  // notice would report "this person is not an admin" about a roster we never
  // read. A definitive negative is only earned by a successful read.
  const fetchAdmins = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Failed to load admins: ${error}`);
        setLoadFailed(true);
        return;
      }
      const { admins: rows } = (await res.json()) as { admins: AdminRow[] };
      setAdmins(rows);
      setLoadFailed(false);
    } catch (err) {
      toast.error(
        `Failed to load admins: ${err instanceof Error ? err.message : "network error"}`,
      );
      setLoadFailed(true);
    }
  }, []);

  // This used to be `if (!res.ok) return;` — a bare swallow. The audit log then
  // rendered as an EMPTY, successfully-loaded table titled "Audit log (0)", on
  // the one surface whose entire purpose is proving that every admin change was
  // recorded. "No admin changes have been logged" and "we could not read the
  // log" are opposite statements, and the swallow published the reassuring one.
  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/admins/audit?limit=50");
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Failed to load audit log: ${error}`);
        setAuditFailed(true);
        return;
      }
      const { entries } = (await res.json()) as { entries: AuditEntry[] };
      setAudit(entries);
      setAuditFailed(false);
    } catch (err) {
      toast.error(
        `Failed to load audit log: ${err instanceof Error ? err.message : "network error"}`,
      );
      setAuditFailed(true);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchAdmins(), fetchAudit()]).finally(() => setLoading(false));
  }, [fetchAdmins, fetchAudit]);

  // The failed read owns its own recovery — without this the only way out of a
  // stale roster is reloading the page, which is not a fix we should make a
  // super-admin discover on their own.
  const [retrying, setRetrying] = useState(false);
  const retryLoad = useCallback(() => {
    setRetrying(true);
    Promise.all([fetchAdmins(), fetchAudit()]).finally(() => setRetrying(false));
  }, [fetchAdmins, fetchAudit]);

  async function handleLookup() {
    const email = emailQuery.trim();
    if (!email) return;
    setLookupBusy(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const res = await fetch(
        `/api/admin/admins/lookup?email=${encodeURIComponent(email)}`,
      );
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        setLookupError(error);
        return;
      }
      const { user } = (await res.json()) as { user: LookupResult | null };
      if (!user) {
        setLookupError(`No user found with email "${email}".`);
        return;
      }
      if (user.is_admin) {
        setLookupError(
          `${user.email} is already an admin (${LEVEL_LABEL[user.admin_level!]}).`,
        );
        return;
      }
      setLookupResult(user);
    } finally {
      setLookupBusy(false);
    }
  }

  async function handlePromote() {
    if (!lookupResult) return;
    setPromoteBusy(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: lookupResult.user_id,
          level: newLevel,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        toast.error(`Failed to promote: ${error}`);
        return;
      }
      toast.success(`${lookupResult.email} is now ${LEVEL_LABEL[newLevel]}.`);
      setEmailQuery("");
      setLookupResult(null);
      setNewLevel("developer");
      await Promise.all([fetchAdmins(), fetchAudit()]);
    } finally {
      setPromoteBusy(false);
    }
  }

  const handleLevelChange = useCallback(
    async (row: AdminRow, level: AdminLevel) => {
      if (level === row.level) return;
      setRowBusy((s) => ({ ...s, [row.user_id]: true }));
      try {
        const res = await fetch(`/api/admin/admins/${row.user_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          toast.error(`Update failed: ${error}`);
          return;
        }
        toast.success(`${row.email ?? row.user_id} → ${LEVEL_LABEL[level]}`);
        await Promise.all([fetchAdmins(), fetchAudit()]);
      } finally {
        setRowBusy((s) => ({ ...s, [row.user_id]: false }));
      }
    },
    [fetchAdmins, fetchAudit],
  );

  const handleRevoke = useCallback(
    async (row: AdminRow) => {
      const ok = await confirm({
        title: "Revoke admin access",
        description: `Permanently revoke admin access for ${row.email ?? row.user_id}. They will no longer be able to access /administration. This is reversible — you can re-promote them later.`,
        confirmLabel: "Revoke",
        variant: "destructive",
      });
      if (!ok) return;

      setRowBusy((s) => ({ ...s, [row.user_id]: true }));
      try {
        const res = await fetch(`/api/admin/admins/${row.user_id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          toast.error(`Revoke failed: ${error}`);
          return;
        }
        toast.success(`Revoked admin access for ${row.email ?? row.user_id}.`);
        await Promise.all([fetchAdmins(), fetchAudit()]);
      } finally {
        setRowBusy((s) => ({ ...s, [row.user_id]: false }));
      }
    },
    [fetchAdmins, fetchAudit],
  );

  const adminColumns = useMemo((): MatrxColumnDef<AdminRow>[] => {
    return [
      {
        id: "email",
        header: "Email",
        accessorFn: (r) => r.email ?? r.user_id,
        width: 260,
        cell: (r) => <AdminUserRef userId={r.user_id} email={r.email} />,
      },
      {
        id: "level",
        header: "Level",
        accessorFn: (r) => LEVEL_LABEL[r.level],
        filter: "select",
        width: 130,
        cell: (r) => (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${levelBadgeClass(r.level)}`}
          >
            {LEVEL_LABEL[r.level]}
          </span>
        ),
      },
      {
        id: "admin_created_at",
        accessorKey: "admin_created_at",
        header: "Promoted",
        width: 180,
        cell: (r) => (
          <span className="text-muted-foreground">{formatDate(r.admin_created_at)}</span>
        ),
      },
      {
        id: "last_sign_in_at",
        accessorKey: "last_sign_in_at",
        header: "Last sign-in",
        width: 180,
        cell: (r) => (
          <span className="text-muted-foreground">{formatDate(r.last_sign_in_at)}</span>
        ),
      },
      {
        id: "user_id",
        accessorKey: "user_id",
        header: "User ID",
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, []);

  const auditColumns = useMemo((): MatrxColumnDef<AuditEntry>[] => {
    return [
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "When",
        width: 180,
        cell: (e) => (
          <span className="text-muted-foreground">{formatDate(e.created_at)}</span>
        ),
      },
      {
        id: "actor",
        header: "Actor",
        accessorFn: (e) => e.actor_email ?? "system / service-role",
        width: 220,
        cell: (e) =>
          e.actor_user_id ? (
            <AdminUserRef userId={e.actor_user_id} email={e.actor_email} />
          ) : (
            <span className="italic text-muted-foreground">system / service-role</span>
          ),
      },
      {
        id: "action",
        accessorKey: "action",
        header: "Action",
        filter: "select",
        width: 110,
        cell: (e) => (
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-foreground">
            {e.action}
          </span>
        ),
      },
      {
        id: "target",
        header: "Target",
        accessorFn: (e) => e.target_email ?? e.target_user_id,
        width: 240,
        cell: (e) => (
          <AdminUserRef userId={e.target_user_id} email={e.target_email} />
        ),
      },
      {
        id: "change",
        header: "Change",
        accessorFn: auditChange,
        width: 220,
        cell: (e) => <span className="text-muted-foreground">{auditChange(e)}</span>,
      },
    ];
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <ShieldCheck className="h-6 w-6 text-rose-500" />
              Admins &amp; Levels
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Promote, demote, or revoke admin access. Guarded at the database
              layer — not just here.
            </p>
          </div>
        </header>

        {/* Add admin */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <UserPlus className="h-4 w-4" />
            Add admin
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px]">
              <label className="mb-1 block text-xs text-muted-foreground">
                User email
              </label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={emailQuery}
                  onChange={(e) => {
                    setEmailQuery(e.target.value);
                    setLookupResult(null);
                    setLookupError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !lookupBusy) handleLookup();
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={handleLookup}
                  disabled={!emailQuery.trim() || lookupBusy}
                >
                  {lookupBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Find</span>
                </Button>
              </div>
            </div>

            {lookupResult && (
              <>
                <div className="min-w-[160px]">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Level
                  </label>
                  <Select
                    value={newLevel}
                    onValueChange={(v) => setNewLevel(v as AdminLevel)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {LEVEL_LABEL[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handlePromote} disabled={promoteBusy}>
                  {promoteBusy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-1.5 h-4 w-4" />
                  )}
                  Promote {lookupResult.email}
                </Button>
              </>
            )}
          </div>
          {lookupError && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4" />
              {lookupError}
            </p>
          )}
        </section>

        {/* Admin list */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">
            {/* The count is a factual claim about the database. After a failed
                read it would be a claim about a cache, so it is withheld
                rather than quietly restated. */}
            Current admins{loadFailed ? "" : ` (${admins.length})`}
          </h2>

          {/* A toast fades; the stale roster does not. Without this the last
              successful read keeps rendering as though it were current. */}
          {loadFailed && (
            <StaleDataNotice
              hasData={admins.length > 0}
              what="the admin roster"
              onRetry={retryLoad}
              retrying={retrying}
            />
          )}
          {/* `AdminUserRef` advertises this route as the "Admin level" door, so
              it is reached constantly for people who are NOT admins. Seeding the
              search then leaves an empty table and says nothing — the link looks
              broken. The notice names what happened and still offers the
              account door, since "not an admin" is not "unreachable". */}
          {focusMissed && (
            <DeepLinkMissNotice
              token="user"
              id={focusedUserId}
              href={accountHrefFor(focusedUserId)}
              containerLabel="admin roster"
              onClear={clearUserFocus}
            />
          )}
          <div className="h-[480px]">
            <MatrxDataTable
              data={admins}
              columns={adminColumns}
              getRowId={(r) => r.user_id}
              isLoading={loading}
              pageSize={25}
              // Must not contradict the notice above: with a missed deep link
              // the table is empty because that person is not an admin, not
              // because there are no admins at all.
              emptyState={
                loadFailed
                  ? {
                      // "No admins." after a failed read is a lie about the
                      // database — and on THIS table an alarming one.
                      title: "Roster not loaded",
                      description:
                        "The read failed, so this list is empty for that reason alone. Use Try again above.",
                    }
                  : focusMissed
                    ? {
                        title: "That person isn't an admin",
                        description:
                          "Clear the link above to see every admin on this roster.",
                      }
                    : { title: "No admins." }
              }
              toolbar={{
                search: true,
                searchPlaceholder: "Search email, level, user id…",
                searchValue: adminSearch,
                onSearchChange: setAdminSearch,
              }}
              copy={{
                label: "Admin",
                listLabel: "All admins",
                location: PAGE_LOCATION,
                rowKind: "admin",
                listKind: "admins",
                rowDescription: "A single admin row.",
                listDescription: "All current admins and their levels.",
                humanRow: adminSummary,
                rowAttributes: (r) => ({ "user-id": r.user_id, level: r.level }),
                listAttributes: (visible, all) => ({ count: all.length }),
              }}
              detail={{
                title: (r) => r.email ?? r.user_id,
                description: (r) => `${LEVEL_LABEL[r.level]} · promoted ${formatDate(r.admin_created_at)}`,
              }}
              rowActions={(row) => {
                const busy = !!rowBusy[row.user_id];
                return (
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Select
                      value={row.level}
                      onValueChange={(v) => void handleLevelChange(row, v as AdminLevel)}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l} value={l} className="text-xs">
                            {LEVEL_LABEL[l]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRevoke(row)}
                      disabled={busy}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="ml-1.5">Revoke</span>
                    </Button>
                  </div>
                );
              }}
            />
          </div>
        </section>

        {/* Audit log */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground">
              Audit log{auditFailed ? "" : ` (${audit.length})`}
            </h2>
            <p className="text-xs text-muted-foreground">
              Every admin change is logged at the DB layer, including any made via direct SQL.
            </p>
          </div>
          {auditFailed && (
            <StaleDataNotice
              hasData={audit.length > 0}
              what="the audit log"
              onRetry={retryLoad}
              retrying={retrying}
            />
          )}
          <div className="h-[440px]">
            <MatrxDataTable
              data={audit}
              columns={auditColumns}
              getRowId={(e) => e.id}
              isLoading={loading}
              pageSize={25}
              emptyState={
                auditFailed
                  ? {
                      // "No audit entries yet." on an unread log is the most
                      // dangerous empty state on this page: it reads as proof
                      // that nothing happened.
                      title: "Audit log not loaded",
                      description:
                        "The read failed. This is not evidence that no admin changes were made — use Try again above.",
                    }
                  : { title: "No audit entries yet." }
              }
              toolbar={{
                search: true,
                searchPlaceholder: "Search actor, action, target…",
              }}
              copy={{
                label: "Audit entry",
                listLabel: "Audit log",
                location: PAGE_LOCATION,
                rowKind: "admin-audit-entry",
                listKind: "admin-audit-log",
                listDescription: "The admin audit log entries currently shown.",
                humanRow: (e) =>
                  `${formatDate(e.created_at)} · ${e.action} · actor: ${e.actor_email ?? "system"} · target: ${e.target_email ?? e.target_user_id} · ${auditChange(e)}`,
                rowAttributes: (e) => ({ id: e.id, action: e.action }),
                listAttributes: (visible, all) => ({ count: all.length }),
              }}
              detail={{
                title: (e) => `${e.action} · ${e.target_email ?? e.target_user_id}`,
                description: (e) => formatDate(e.created_at),
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdminsManagementPage() {
  // useSearchParams needs a Suspense boundary under the App Router.
  return (
    <Suspense fallback={null}>
      <AdminsManagementPageContent />
    </Suspense>
  );
}
