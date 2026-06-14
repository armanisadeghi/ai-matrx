"use client";

// Users management — Super Admin only.
//
// The (admin) layout already requires Super Admin and the /api/admin/users
// route re-checks server-side. This page lists every auth user and lets an
// admin flip the onboarding ("new user") flag, which controls whether a user
// is sent to /welcome instead of /dashboard on login.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Sparkles, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

const PAGE_LOCATION = "AI Matrx Admin — Users (/administration/users)";

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  onboarding_completed: boolean;
}

type StatusFilter = "all" | "new" | "onboarded";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function userSummary(row: UserRow): string {
  return [
    `Email: ${row.email ?? "—"}`,
    `Name: ${row.full_name ?? "—"}`,
    `Status: ${row.onboarding_completed ? "Onboarded" : "New"}`,
    `User ID: ${row.id}`,
    `Created: ${formatDate(row.created_at)}`,
    `Last sign-in: ${formatDate(row.last_sign_in_at)}`,
  ].join("\n");
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      const { error } = await res
        .json()
        .catch(() => ({ error: res.statusText }));
      toast.error(`Failed to load users: ${error}`);
      return;
    }
    const { users: rows } = (await res.json()) as { users: UserRow[] };
    setUsers(rows);
  }, []);

  useEffect(() => {
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  async function setOnboarding(row: UserRow, completed: boolean) {
    if (completed === row.onboarding_completed) return;
    setRowBusy((s) => ({ ...s, [row.id]: true }));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.id,
          onboardingCompleted: completed,
        }),
      });
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Update failed: ${error}`);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === row.id ? { ...u, onboarding_completed: completed } : u,
        ),
      );
      toast.success(
        `${row.email ?? row.id} marked as ${completed ? "onboarded" : "new"}.`,
      );
    } finally {
      setRowBusy((s) => ({ ...s, [row.id]: false }));
    }
  }

  const stats = useMemo(() => {
    const total = users.length;
    const newCount = users.filter((u) => !u.onboarding_completed).length;
    return { total, newCount, onboarded: total - newCount };
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === "new" && u.onboarding_completed) return false;
      if (statusFilter === "onboarded" && !u.onboarding_completed) return false;
      if (!q) return true;
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    });
  }, [users, query, statusFilter]);

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Users className="h-6 w-6 text-sky-500" />
              Users
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every account, and whether each is treated as new. New users land
              on <code className="text-xs">/welcome</code> instead of the
              dashboard until their onboarding flag is flipped.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" /> {stats.total} total
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-4 w-4" /> {stats.newCount} new
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="h-4 w-4" /> {stats.onboarded} onboarded
            </span>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by email, name, or user ID"
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-1">
              {(["all", "new", "onboarded"] as StatusFilter[]).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={statusFilter === f ? "default" : "outline"}
                  onClick={() => setStatusFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading users…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No users match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">User</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Last sign-in</th>
                    <th className="px-4 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const busy = !!rowBusy[row.id];
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/60 last:border-0 hover:bg-accent/40"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">
                                {row.email ?? "—"}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {row.full_name ?? row.id}
                              </div>
                            </div>
                            <CopyButtons
                              human={() => userSummary(row)}
                              agent={() => ({
                                kind: "user",
                                location: PAGE_LOCATION,
                                description: "A single user row.",
                                data: row,
                                summary: userSummary(row),
                                attributes: { id: row.id, email: row.email },
                              })}
                              label={row.email ?? row.id}
                              size="icon"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {row.onboarding_completed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                              <UserCheck className="h-3 w-3" /> Onboarded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              <Sparkles className="h-3 w-3" /> New
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {formatDate(row.last_sign_in_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              setOnboarding(row, !row.onboarding_completed)
                            }
                          >
                            {busy && (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            )}
                            {row.onboarding_completed
                              ? "Mark as new"
                              : "Mark onboarded"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
