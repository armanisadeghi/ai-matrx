"use client";

// Admin management — Super Admin only.
//
// The (admin-auth) layout already requires Super Admin (it calls
// checkIsSuperAdmin and redirects otherwise), so this page only renders
// for Super Admins. Every API route below also requires Super Admin
// server-side, and the underlying RPCs gate again at the DB layer.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ShieldAlert, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

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
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type { Database } from "@/types/database.types";

const PAGE_LOCATION = "AI Matrx Admin — Admins & Levels (/administration/admins)";

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

export default function AdminsManagementPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-admin form state
  const [emailQuery, setEmailQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<AdminLevel>("developer");
  const [promoteBusy, setPromoteBusy] = useState(false);

  // Per-row update state
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const fetchAdmins = useCallback(async () => {
    const res = await fetch("/api/admin/admins");
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }));
      toast.error(`Failed to load admins: ${error}`);
      return;
    }
    const { admins: rows } = (await res.json()) as { admins: AdminRow[] };
    setAdmins(rows);
  }, []);

  const fetchAudit = useCallback(async () => {
    const res = await fetch("/api/admin/admins/audit?limit=50");
    if (!res.ok) return;
    const { entries } = (await res.json()) as { entries: AuditEntry[] };
    setAudit(entries);
  }, []);

  useEffect(() => {
    Promise.all([fetchAdmins(), fetchAudit()]).finally(() => setLoading(false));
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

  async function handleLevelChange(row: AdminRow, level: AdminLevel) {
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
  }

  async function handleRevoke(row: AdminRow) {
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
  }

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
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
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">
              Current admins ({admins.length})
            </h2>
            {admins.length > 0 && (
              <CopyButtons
                size="sm"
                label="All admins"
                human={() => admins.map(adminSummary).join("\n\n")}
                agent={() => ({
                  kind: "admins",
                  location: PAGE_LOCATION,
                  description: "All current admins and their levels.",
                  data: admins,
                  attributes: { count: admins.length },
                })}
              />
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Level</th>
                  <th className="px-4 py-2 font-medium">Promoted</th>
                  <th className="px-4 py-2 font-medium">Last sign-in</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </td>
                  </tr>
                )}
                {!loading && admins.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No admins.
                    </td>
                  </tr>
                )}
                {admins.map((row) => {
                  const busy = !!rowBusy[row.user_id];
                  return (
                    <tr key={row.user_id}>
                      <td className="px-4 py-2 align-middle font-medium text-foreground">
                        {row.email ?? <span className="text-muted-foreground">{row.user_id}</span>}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${levelBadgeClass(row.level)}`}
                          >
                            {LEVEL_LABEL[row.level]}
                          </span>
                          <Select
                            value={row.level}
                            onValueChange={(v) => handleLevelChange(row, v as AdminLevel)}
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
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-muted-foreground">
                        {formatDate(row.admin_created_at)}
                      </td>
                      <td className="px-4 py-2 align-middle text-muted-foreground">
                        {formatDate(row.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-2 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                        <CopyButtons
                          size="icon"
                          label={row.email ?? row.user_id}
                          human={() => adminSummary(row)}
                          agent={() => ({
                            kind: "admin",
                            location: PAGE_LOCATION,
                            description: "A single admin row.",
                            data: row,
                            summary: adminSummary(row),
                            attributes: {
                              "user-id": row.user_id,
                              level: row.level,
                            },
                          })}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(row)}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Audit log */}
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">
              Audit log ({audit.length})
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Every admin change is logged at the DB layer, including any made via direct SQL.
              </p>
              {audit.length > 0 && (
                <CopyButtons
                  size="sm"
                  label="Audit log"
                  human={() =>
                    audit
                      .map(
                        (e) =>
                          `${formatDate(e.created_at)} · ${e.action} · actor: ${e.actor_email ?? "system"} · target: ${e.target_email ?? e.target_user_id}`,
                      )
                      .join("\n")
                  }
                  agent={() => ({
                    kind: "admin-audit-log",
                    location: PAGE_LOCATION,
                    description: "The admin audit log entries currently shown.",
                    data: audit,
                    attributes: { count: audit.length },
                  })}
                />
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Target</th>
                  <th className="px-4 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No audit entries yet.
                    </td>
                  </tr>
                )}
                {audit.map((entry) => {
                  const before = entry.before as { level?: AdminLevel } | null;
                  const after = entry.after as { level?: AdminLevel } | null;
                  let change = "";
                  if (entry.action === "promote") {
                    change = `→ ${after?.level ? LEVEL_LABEL[after.level] : ""}`;
                  } else if (entry.action === "update") {
                    if (before?.level && after?.level && before.level !== after.level) {
                      change = `${LEVEL_LABEL[before.level]} → ${LEVEL_LABEL[after.level]}`;
                    } else {
                      change = "permissions / metadata";
                    }
                  } else if (entry.action === "revoke") {
                    change = `was ${before?.level ? LEVEL_LABEL[before.level] : "admin"}`;
                  }
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2 align-middle text-muted-foreground">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="px-4 py-2 align-middle text-foreground">
                        {entry.actor_email ?? (
                          <span className="text-muted-foreground italic">
                            system / service-role
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-foreground">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-middle text-foreground">
                        {entry.target_email ?? entry.target_user_id}
                      </td>
                      <td className="px-4 py-2 align-middle text-muted-foreground">
                        {change}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
