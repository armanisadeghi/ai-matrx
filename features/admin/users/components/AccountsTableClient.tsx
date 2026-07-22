"use client";

// Accounts tab of the Users & Access hub — the canonical roster.
//
// Full user data (auth facts + profile name/avatar + admin level) in the
// official MatrxDataTable: per-column sort/filter, Copy-for-AI (row + view),
// and real per-row actions (magic link, password reset, email, onboarding
// flag) plus cross-links to this user's preferences / usage / admin level via
// ?user=<id>. An admin surface hides nothing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Gauge,
  KeyRound,
  Loader2,
  Mail,
  MailPlus,
  MessageSquare,
  MoreHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { USERS_ADMIN_LOCATION, ADMIN_LEVEL_LABEL } from "../constants";
import type { AdminUserRow } from "../types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function levelBadge(level: string | null) {
  if (!level) return <span className="text-xs text-muted-foreground">—</span>;
  const label = ADMIN_LEVEL_LABEL[level] ?? level;
  const variant =
    level === "super_admin"
      ? "text-rose-600 border-rose-500/40 bg-rose-500/10"
      : level === "senior_admin"
        ? "text-amber-600 border-amber-500/40 bg-amber-500/10"
        : "text-sky-600 border-sky-500/40 bg-sky-500/10";
  return (
    <Badge variant="outline" className={variant}>
      {label}
    </Badge>
  );
}

export function AccountsTableClient() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load users");
        if (!cancelled) setRows(json.users as AdminUserRow[]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const sendAuthLink = useCallback(
    async (row: AdminUserRow, type: "magiclink" | "recovery") => {
      const noun = type === "magiclink" ? "magic sign-in link" : "password reset link";
      const ok = await confirm({
        title: `Send ${noun}?`,
        description: `Email a ${noun} to ${row.email}. This is a single-use link that lets them sign in / reset without their current password.`,
        confirmLabel: "Send",
      });
      if (!ok) return;
      try {
        const res = await fetch("/api/admin/users/auth-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: row.id, email: row.email, type, send: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        toast.success(`Sent ${noun} to ${row.email}`, {
          action: json.action_link
            ? {
                label: "Copy link",
                onClick: () => void navigator.clipboard.writeText(json.action_link),
              }
            : undefined,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to send");
      }
    },
    [],
  );

  const toggleOnboarding = useCallback(
    async (row: AdminUserRow) => {
      const next = !row.onboarding_completed;
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: row.id, onboardingCompleted: next }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, onboarding_completed: next } : r,
          ),
        );
        toast.success(next ? "Marked as onboarded" : "Marked as new");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    },
    [],
  );

  // In-app DM: create/find the direct conversation with the user, then send.
  const [dmTarget, setDmTarget] = useState<AdminUserRow | null>(null);
  const [dmContent, setDmContent] = useState("");
  const [dmSending, setDmSending] = useState(false);

  const sendDm = useCallback(async () => {
    if (!dmTarget || !dmContent.trim()) return;
    setDmSending(true);
    try {
      const convRes = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "direct", participant_ids: [dmTarget.id] }),
      });
      const convJson = await convRes.json();
      if (!convRes.ok || !convJson.success)
        throw new Error(convJson.msg ?? "Could not open conversation");
      const conversationId = convJson.data?.ConversationID as string;
      const msgRes = await fetch(`/api/messages/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: dmContent.trim() }),
      });
      const msgJson = await msgRes.json();
      if (!msgRes.ok || !msgJson.success)
        throw new Error(msgJson.msg ?? "Could not send message");
      toast.success(`Message sent to ${dmTarget.display_name ?? dmTarget.email}`, {
        action: {
          label: "Open thread",
          onClick: () => router.push("/messages"),
        },
      });
      setDmTarget(null);
      setDmContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setDmSending(false);
    }
  }, [dmTarget, dmContent, router]);

  const columns = useMemo((): MatrxColumnDef<AdminUserRow>[] => {
    return [
      {
        id: "display_name",
        accessorKey: "display_name",
        header: "Name",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              {row.avatar_url ? <AvatarImage src={row.avatar_url} alt="" /> : null}
              <AvatarFallback className="text-[10px]">
                {(row.display_name ?? row.email ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">
              {row.display_name ?? <span className="text-muted-foreground">—</span>}
            </span>
          </div>
        ),
        width: 200,
      },
      { id: "email", accessorKey: "email", header: "Email", width: 220 },
      {
        id: "organizations",
        header: "Organizations",
        accessorFn: (row) =>
          row.organizations
            .map((organization) => `${organization.name} ${organization.role}`)
            .join(" "),
        cell: (row) => (
          <button
            type="button"
            className="flex max-w-[280px] items-center gap-1.5 text-left hover:text-primary"
            onClick={(event) => {
              event.stopPropagation();
              router.push(
                `/administration/users/organizations?user=${row.id}`,
              );
            }}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs">
              {row.organizations.length > 0
                ? row.organizations
                    .map((organization) => organization.name)
                    .join(", ")
                : "No organizations"}
            </span>
            {row.organizations.length > 1 ? (
              <Badge
                variant="secondary"
                className="h-5 shrink-0 px-1.5 text-[10px]"
              >
                {row.organizations.length}
              </Badge>
            ) : null}
          </button>
        ),
        width: 280,
      },
      {
        id: "admin_level",
        accessorKey: "admin_level",
        header: "Admin",
        filter: "select",
        cell: (row) => levelBadge(row.admin_level),
        width: 120,
      },
      {
        id: "providers",
        header: "Providers",
        accessorFn: (r) => r.providers.join(", "),
        filter: "select",
        cell: (row) =>
          row.providers.length ? (
            <span className="text-xs">{row.providers.join(", ")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 120,
      },
      {
        id: "email_confirmed",
        accessorKey: "email_confirmed",
        header: "Confirmed",
        filter: "boolean",
        align: "center",
        cell: (row) =>
          row.email_confirmed ? (
            <BadgeCheck className="mx-auto h-4 w-4 text-emerald-500" />
          ) : (
            <span className="text-xs text-muted-foreground">No</span>
          ),
        width: 90,
      },
      {
        id: "onboarding_completed",
        accessorKey: "onboarding_completed",
        header: "Onboarded",
        filter: "boolean",
        align: "center",
        cell: (row) => (
          <span className="text-xs">{row.onboarding_completed ? "Yes" : "New"}</span>
        ),
        width: 90,
      },
      {
        id: "last_sign_in_at",
        accessorKey: "last_sign_in_at",
        header: "Last sign-in",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {fmtDate(row.last_sign_in_at)}
          </span>
        ),
        width: 120,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {fmtDate(row.created_at)}
          </span>
        ),
        width: 110,
      },
      {
        id: "phone",
        accessorKey: "phone",
        header: "Phone",
        cell: (row) =>
          row.phone ? (
            <span className="text-xs">{row.phone}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 120,
      },
      {
        id: "id",
        accessorKey: "id",
        header: "User ID",
        cellKind: "uuid",
        sortable: false,
        filter: false,
        width: 120,
      },
    ];
  }, [router]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          pageSize={50}
          emptyState={{ title: "No users", description: "No accounts match your filters." }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search name, email, id…",
            actions: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRefreshKey((current) => current + 1)}
              >
                Refresh
              </Button>
            ),
          }}
          copy={{
            label: "User",
            listLabel: "Users (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "user",
            listKind: "users",
            rowDescription: "One account from the admin Users roster.",
            listDescription: "Filtered/sorted user accounts currently visible.",
            humanRow: (r) =>
              [
                `${r.display_name ?? "(no name)"} <${r.email ?? "no-email"}>`,
                `id=${r.id}`,
                r.admin_level ? `admin=${r.admin_level}` : null,
                `providers=${r.providers.join("/") || "none"} confirmed=${r.email_confirmed} onboarded=${r.onboarding_completed}`,
                `created=${r.created_at ?? "?"} last_sign_in=${r.last_sign_in_at ?? "never"}`,
                `organizations=${r.organizations.map((organization) => `${organization.name}:${organization.role}`).join(",") || "none"}`,
              ]
                .filter(Boolean)
                .join("\n"),
            rowAttributes: (r) => ({
              id: r.id,
              email: r.email,
              admin_level: r.admin_level,
              onboarded: r.onboarding_completed,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
            }),
          }}
          rowActions={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">
                  {row.email ?? row.id}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/administration/users/organizations?user=${row.id}`,
                    )
                  }
                >
                  <Building2 className="mr-2 h-4 w-4" /> Organizations
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void sendAuthLink(row, "magiclink")}
                  disabled={!row.email}
                >
                  <MailPlus className="mr-2 h-4 w-4" /> Send magic link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void sendAuthLink(row, "recovery")}
                  disabled={!row.email}
                >
                  <KeyRound className="mr-2 h-4 w-4" /> Send password reset
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/administration/users/email?userId=${row.id}`,
                    )
                  }
                  disabled={!row.email}
                >
                  <Mail className="mr-2 h-4 w-4" /> Email user
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setDmTarget(row);
                    setDmContent("");
                  }}
                  disabled={row.is_anonymous}
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> Send in-app message
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/administration/users/preferences?user=${row.id}`,
                    )
                  }
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" /> Preferences
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/administration/users/usage?user=${row.id}`)
                  }
                >
                  <Gauge className="mr-2 h-4 w-4" /> Usage & cost
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/administration/users/admins?user=${row.id}`)
                  }
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Admin level
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void toggleOnboarding(row)}>
                  <UserCog className="mr-2 h-4 w-4" />
                  {row.onboarding_completed ? "Mark as new" : "Mark as onboarded"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      </div>

      <Dialog
        open={dmTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              In-app message to {dmTarget?.display_name ?? dmTarget?.email}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Sends a direct message from you into the user&apos;s in-app inbox (the
            DM system). They see it in Messages.
          </p>
          <Textarea
            value={dmContent}
            onChange={(e) => setDmContent(e.target.value)}
            placeholder="Write your message…"
            rows={5}
            className="resize-none"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDmTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void sendDm()} disabled={dmSending || !dmContent.trim()}>
              {dmSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="mr-2 h-4 w-4" />
              )}
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
