"use client";

// Accounts tab of the Users & Access hub — the canonical roster.
//
// Full user data (auth facts + profile name/avatar + admin level) in the
// official MatrxDataTable: per-column sort/filter, Copy-for-AI (row + view),
// and real per-row actions (magic link, password reset, email, onboarding
// flag) plus cross-links to this user's preferences / usage / admin level via
// ?user=<id>. An admin surface hides nothing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  UserRound,
  X,
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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AdminUserRef } from "./AdminUserRef";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `?user=<id>` is THE canonical destination for a named user (AdminUserRef's
  // first door). Same focus-banner shape the sibling consoles already use.
  const focusedUserId = searchParams.get("user");
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
            <AdminUserRef
              userId={row.id}
              name={row.display_name}
              email={row.email}
              hideEmail
            />
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
        // Every organization named here is a real record with a route — each
        // one links to itself instead of being flattened into a comma string
        // whose only destination was a filtered list of the OTHER entity.
        cell: (row) =>
          row.organizations.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No organizations
            </span>
          ) : (
            <div className="flex max-w-[280px] items-center gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                {row.organizations.map((organization, index) => (
                  <span
                    key={organization.id}
                    className="inline-flex min-w-0 items-center text-xs"
                  >
                    <EntityRef
                      token="organization"
                      id={organization.id}
                      name={organization.name}
                      showIcon={false}
                    />
                    {index < row.organizations.length - 1 ? (
                      <span className="text-muted-foreground">,</span>
                    ) : null}
                  </span>
                ))}
              </div>
              <button
                type="button"
                title="View this user's organizations"
                aria-label="View this user's organizations"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  router.push(
                    `/administration/users/organizations?user=${row.id}`,
                  );
                }}
              >
                <Building2 className="h-3.5 w-3.5" />
              </button>
            </div>
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

  // Derived, never stored: a deep link that arrives after load and one that
  // arrives before it resolve identically, and closing the focus cannot fight a
  // seeding effect.
  const focusedUser = focusedUserId
    ? (rows.find((row) => row.id === focusedUserId) ?? null)
    : null;
  const visibleRows = focusedUserId
    ? rows.filter((row) => row.id === focusedUserId)
    : rows;
  // The roster loaded and the requested account is not in it. Saying "no
  // accounts match your filters" here would blame a filter for a record that
  // simply is not in this list.
  const focusMissed = Boolean(
    focusedUserId && !loading && !error && focusedUser === null,
  );

  function clearUserFocus() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("user");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {focusedUserId ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <UserRound className="h-4 w-4 shrink-0 text-primary" />
            {focusMissed ? (
              <span className="min-w-0">
                No account with id{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  {focusedUserId}
                </code>{" "}
                is in this roster — it may have been deleted, or it may sit
                outside what this view loads.
              </span>
            ) : (
              <>
                <span className="shrink-0">Showing</span>
                <AdminUserRef
                  userId={focusedUserId}
                  name={focusedUser?.display_name}
                  email={focusedUser?.email}
                  hideEmail
                />
              </>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={clearUserFocus}>
            <X className="mr-1 h-4 w-4" /> Show all accounts
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={visibleRows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          pageSize={50}
          // A focused id that is not in the roster must NOT be reported as a
          // filter miss — that blames a control the user never touched for a
          // record that simply is not in this list. The banner above says what
          // actually happened; this only has to stop contradicting it.
          emptyState={
            focusMissed
              ? {
                  title: "That account isn't in this roster",
                  description:
                    "Clear the focus above to see every account this view loads.",
                }
              : {
                  title: "No users",
                  description: "No accounts match your filters.",
                }
          }
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
            // `all` is the table's DATA prop, which is the focus-filtered
            // array — so the framework's own `total_count` reported 1 while the
            // roster held N accounts, telling any agent reading the payload
            // that the platform has one user. `listAttributes` is spread LAST
            // in buildListPayload, so overriding `total_count` here corrects
            // the canonical key rather than adding a second, truer one beside
            // a wrong one. The focused id is named so the payload explains its
            // own narrowness instead of silently understating the fleet.
            listAttributes: (visible) => ({
              visible_count: visible.length,
              total_count: rows.length,
              ...(focusedUserId ? { focused_user_id: focusedUserId } : {}),
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
