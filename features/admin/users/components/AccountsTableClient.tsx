"use client";

// Accounts tab of the Users & Access hub — the canonical roster.
//
// Full user data (auth facts + profile name/avatar + admin level) in the
// official MatrxDataTable: per-column sort/filter, Copy-for-AI (row + view),
// and real per-row actions (magic link, password reset, email, onboarding
// flag) plus cross-links to this user's preferences / usage / admin level via
// ?user=<id>. An admin surface hides nothing.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Gauge,
  Gift,
  GraduationCap,
  KeyRound,
  Loader2,
  Mail,
  MailPlus,
  MessageSquare,
  MoreHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserCog,
  UserRound,
  UserX,
  WalletCards,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { formatCount } from "@ai-matrx/kit/format";
import { Cost } from "@/components/cost/Cost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { filterAndSortRows } from "@ai-matrx/design-system/data-table/filter-engine";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_USERS_SURFACE_NAME } from "@/features/surfaces/manifests/admin-users.manifest";
import { buildAdminUsersScope } from "../lib/admin-users-scope";
import { AdminUserRef } from "./AdminUserRef";
import { USERS_ADMIN_LOCATION, ADMIN_LEVEL_LABEL } from "../constants";
import type { AdminUserRow } from "../types";
import { ErrorNotice } from "@ai-matrx/design-system";
import {
  ChangePlanDialog,
  type ChangePlanSubject,
} from "@/features/admin/limits/components/ChangePlanDialog";
import { periodLabel } from "@/features/admin/limits/types";
import { UserResearchDialog } from "./UserResearchDialog";
import { GiveFreeMonthsDialog, type FreeMonthsPerson } from "./GiveFreeMonthsDialog";
import { SendTutorialDialog, type TutorialRecipient } from "@/features/guided-tutorials/admin/SendTutorialDialog";
import { readUserResearch } from "../service/userResearch";
import { sendDirectMessage } from "../service/coupons";
import { RELATIONSHIP_LABELS, CONTACT_STATE_LABELS, feedbackDmKey, type UserResearch } from "../lib/userResearch";
import { ProTextarea } from "@/components/official/ProTextarea";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildAdminUserMenuSection } from "./admin-user-menu-section";
import { pushAppHref } from "@/lib/deployment/navigate";
import { pushAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { readOf } from "@ai-matrx/design-system";
import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { DrillOrList } from "@/components/official/drill-explorer/DrillOrList";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";
import { usagePersonHref } from "@/features/admin/usage-drill/usageLinks";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import {
  PERSON_KIND_LABEL,
  PERSON_STAGE_LABEL,
  PERSON_STAGE_RANK,
  withOwnerCategory,
} from "../lib/personSegments";
import {
  ACCOUNT_SEGMENTS,
  DEFAULT_ACCOUNT_SEGMENT,
  isAccountSegment,
  rowInSegment,
  type AccountSegment,
} from "../lib/accountSegments";

const ROSTER_PAGE_SIZE = 50;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const USAGE_TONE: Record<NonNullable<AdminUserRow["plan"]>["state"], string> = {
  ok: "text-muted-foreground",
  near: "text-amber-600 border-amber-500/40 bg-amber-500/10",
  over: "text-rose-600 border-rose-500/40 bg-rose-500/10",
};

const PLAN_SOURCE_LABEL: Record<NonNullable<AdminUserRow["plan"]>["source"], string> = {
  grant: "Assigned to this person",
  default: "Default plan",
  guest: "Guest allowance",
  organization: "From the organization's Enterprise values",
};

function usageTitle(plan: NonNullable<AdminUserRow["plan"]>): string | undefined {
  const b = plan.binding;
  if (!b) return undefined;
  const limit = b.limit === null ? "unlimited" : formatCount(b.limit);
  const resets = b.resets_at ? ` · resets ${new Date(b.resets_at).toLocaleString()}` : "";
  return `${periodLabel(b.period)}: ${formatCount(b.used)} / ${limit} points${resets}`;
}

const KIND_TONE: Record<AdminUserRow["kind"], string> = {
  person: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  circle: "text-violet-600 border-violet-500/40 bg-violet-500/10",
  team: "text-sky-600 border-sky-500/40 bg-sky-500/10",
  test: "text-muted-foreground border-border bg-muted",
  bot: "text-amber-600 border-amber-500/40 bg-amber-500/10",
};

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

/** Organizations shown inline in the Accounts cell; the rest sit behind "+N more". */
const ORG_CELL_VISIBLE = 3;

function AccountsRoster() {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `?user=<id>` is THE canonical destination for a named user (AdminUserRef's
  // first door). Same focus-banner shape the sibling consoles already use.
  const focusedUserId = searchParams.get("user");
  // Which slice of the roster is showing. Default: people who signed up —
  // bots, test accounts and idle guests are one click away, with their count
  // on the button, never silently dropped.
  const segmentParam = searchParams.get("segment");
  const segment: AccountSegment = isAccountSegment(segmentParam)
    ? segmentParam
    : DEFAULT_ACCOUNT_SEGMENT;
  const { prefs: viewPrefs, setPrefs: setViewPrefs } =
    useListViewPrefs("admin-user-accounts");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [planTarget, setPlanTarget] = useState<ChangePlanSubject | null>(null);
  const [freeMonthsPeople, setFreeMonthsPeople] = useState<FreeMonthsPerson[] | null>(null);
  const [tutorialPerson, setTutorialPerson] = useState<TutorialRecipient | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const researchOwnerId = useAppSelector(state => state.userAuth.id);
  const costDisplay = useCostDisplay();
  const [refreshKey, setRefreshKey] = useState(0);
  const [research, setResearch] = useState<UserResearch[]>([]);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchTarget, setResearchTarget] = useState<AdminUserRow | null>(null);
  const researchByUser = useMemo(() => new Map(research.filter(record => record.created_by === researchOwnerId).map(record => [record.subject_id, record])), [research, researchOwnerId]);
  const ownerOrganizations = useMemo(() => new Set(rows.find(row => row.id === researchOwnerId)?.organizations.map(org => org.id) ?? []), [rows, researchOwnerId]);
  useEffect(() => {
    if (!researchOwnerId) return;
    let cancelled = false;
    void readUserResearch(researchOwnerId).then(records => { if (!cancelled) { setResearch(records); setResearchError(null); } })
      .catch(error => { if (!cancelled) setResearchError(error instanceof Error ? error.message : "Could not load personal notes"); });
    return () => { cancelled = true; };
  }, [researchOwnerId, refreshKey]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clickedRow, setClickedRow] = useState<AdminUserRow | null>(null);
  // The table's search / column filters / sort / page live HERE rather than
  // inside MatrxDataTable ("controlled-local": the table still filters the
  // local rows, the caller just owns the query). Without this the admin's
  // live query is invisible to everything outside the table — including the
  // surface emitter, which has to be able to say how many accounts still
  // match what the admin is looking at.
  const tableQuery = useTableUrlState({
    tableId: "user-accounts",
    defaultPageSize: ROSTER_PAGE_SIZE,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load users");
        if (!cancelled) {
          setRows(json.users as AdminUserRow[]);
          setPlansError(typeof json.plans_error === "string" ? json.plans_error : null);
        }
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
      const noun =
        type === "magiclink" ? "magic sign-in link" : "password reset link";
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
          body: JSON.stringify({
            userId: row.id,
            email: row.email,
            type,
            send: true,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        toast.success(`Sent ${noun} to ${row.email}`, {
          action: json.action_link
            ? {
                label: "Copy link",
                onClick: () =>
                  void copyText(json.action_link),
              }
            : undefined,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to send");
      }
    },
    [],
  );

  const toggleOnboarding = useCallback(async (row: AdminUserRow) => {
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
  }, []);

  // Closing an account is the only way to "delete" one: the person row is permanent.
  // iam.close_account / iam.reopen_account check the platform-admin seat themselves.
  const setAccountClosed = useCallback(async (row: AdminUserRow, close: boolean) => {
    const who = row.email ?? row.display_name ?? row.id;
    if (close && row.id === researchOwnerId) {
      toast.error("You cannot close your own account from the roster. Use your account settings.");
      return;
    }
    if (!close && row.erased) {
      toast.error("This account was erased and cannot be reopened.");
      return;
    }
    const ok = await confirm(
      close
        ? {
            title: "Close account?",
            description: `${who} cannot sign in again; an open session can work for up to an hour. API keys are revoked; schedules and connections pause. Records stay, still theirs. Billing is not changed. Reopen any time.`,
            confirmLabel: "Close account",
            variant: "destructive",
          }
        : {
            title: "Reopen account?",
            description: `${who} can sign in again; paused schedules and connections resume. Revoked API keys stay revoked.`,
            confirmLabel: "Reopen",
          },
    );
    if (!ok) return;
    const { error } = await createClient()
      .schema("iam")
      .rpc(close ? "close_account" : "reopen_account", {
        p_user: row.id,
        p_reason: close ? "closed by a platform admin" : "reopened by a platform admin",
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, banned: close } : r)));
    toast.success(close ? `Closed ${who}` : `Reopened ${who}`);
  }, [researchOwnerId]);

  const toggleMcpFullAccess = useCallback(async (row: AdminUserRow) => {
    const next = !row.mcp_full_access;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, mcpFullAccess: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setRows((prev) =>
        prev.map((current) =>
          current.id === row.id
            ? { ...current, mcp_full_access: next }
            : current,
        ),
      );
      toast.success(
        next
          ? `Granted full MCP access to ${row.email ?? row.id}`
          : `Revoked full MCP access from ${row.email ?? row.id}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }, []);

  // In-app DM: create/find the direct conversation with the user, then send.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const [dmTarget, setDmTarget] = useState<AdminUserRow | null>(null);
  const [dmContent, setDmContent] = useState("");
  const [dmSending, setDmSending] = useState(false);

  const sendDm = useCallback(async () => {
    if (!dmTarget || !dmContent.trim() || !researchOwnerId || dmSending) return;
    if (!selectedOrganizationId) {
      // The conversation route files the DM in the admitted organization and
      // refuses without one; say so here instead of sending a request that 400s.
      toast.error(
        "Select an organization from the avatar menu, then try again.",
      );
      return;
    }
    setDmSending(true);
    try {
      await sendDirectMessage({
        userId: dmTarget.id,
        content: dmContent,
        organizationId: selectedOrganizationId,
        replayKey: (conversationId, content) => feedbackDmKey(researchOwnerId, conversationId, content),
      });
      toast.success(
        `Message sent to ${dmTarget.display_name ?? dmTarget.email}`,
        {
          action: {
            label: "Open thread",
            onClick: () => router.push("/messages"),
          },
        },
      );
      setDmTarget(null);
      setDmContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setDmSending(false);
    }
  }, [dmTarget, dmContent, dmSending, researchOwnerId, router, selectedOrganizationId, setDmTarget, setDmContent]);

  const columns = useMemo((): MatrxColumnDef<AdminUserRow>[] => {
    return [
      {
        id: "display_name",
        accessorKey: "display_name",
        header: "Name",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              {row.avatar_url ? (
                <AvatarImage src={row.avatar_url} alt="" />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {(row.display_name ?? row.email ?? "?")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <AdminUserRef
              userId={row.id}
              name={
                row.display_name ??
                (row.is_anonymous ? `Guest ${row.id.slice(0, 6)}` : null)
              }
              email={row.email}
              hideEmail
            />
          </div>
        ),
        width: 200,
      },
      { id: "email", accessorKey: "email", header: "Email", width: 220 },
      { id: "my_category", header: "My category", accessorFn: row => researchError ? "—" : RELATIONSHIP_LABELS[researchByUser.get(row.id)?.category ?? "unknown"], filter: "select", width: 150,
        cell: row => <Button variant="quiet" onClick={() => setResearchTarget(row)}>{researchError ? "—" : RELATIONSHIP_LABELS[researchByUser.get(row.id)?.category ?? "unknown"]}</Button> },
      { id: "contact_status", header: "Contact status", accessorFn: row => researchError ? "—" : CONTACT_STATE_LABELS[researchByUser.get(row.id)?.contact_state ?? (row.banned ? "hold" : "not_contacted")], filter: "select", width: 130 },
      { id: "my_notes", header: "My notes", accessorFn: row => researchByUser.get(row.id)?.notes ?? "", hidden: true, width: 240 },
      {
        id: "kind",
        header: "Who",
        accessorFn: (row) => PERSON_KIND_LABEL[row.kind],
        filter: "select",
        cell: (row) => (
          <Badge
            variant="outline"
            className={KIND_TONE[row.kind]}
            title={row.kind_reason}
          >
            {PERSON_KIND_LABEL[row.kind]}
          </Badge>
        ),
        width: 90,
      },
      {
        id: "stage",
        header: "Stage",
        accessorFn: (row) => PERSON_STAGE_LABEL[row.stage],
        sortValue: (row) => PERSON_STAGE_RANK[row.stage],
        filter: "select",
        cell: (row) => (
          <span
            className={
              row.stage === "active" || row.stage === "used_ai"
                ? "text-xs font-medium text-foreground"
                : "text-xs text-muted-foreground"
            }
          >
            {PERSON_STAGE_LABEL[row.stage]}
          </span>
        ),
        width: 130,
      },
      {
        id: "plan",
        header: "Plan",
        accessorFn: (row) => row.plan?.name ?? "—",
        filter: "select",
        cell: (row) =>
          row.plan ? (
            <span
              className="text-xs"
              title={`${PLAN_SOURCE_LABEL[row.plan.source]}${row.plan.grant_expires_at ? ` · until ${fmtDate(row.plan.grant_expires_at)}` : ""}${row.plan.grant_note ? ` · ${row.plan.grant_note}` : ""}`}
            >
              {row.plan.name}
              <span className="ml-1 text-muted-foreground">
                {row.plan.source === "grant" ? "" : row.plan.source === "guest" ? "(guest)" : row.plan.source === "organization" ? `(${row.plan.organization?.name ?? "organization"})` : "(default)"}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 130,
      },
      {
        id: "usage",
        header: "Usage",
        accessorFn: (row) => row.plan?.state ?? "—",
        filter: "select",
        cell: (row) =>
          row.plan ? (
            <Badge
              variant="outline"
              className={USAGE_TONE[row.plan.state]}
              title={usageTitle(row.plan)}
            >
              {row.plan.state}
              {row.plan.binding && row.plan.binding.limit ? (
                <span className="ml-1 tabular-nums">
                  {Math.min(999, Math.round((row.plan.binding.used / row.plan.binding.limit) * 100))}%
                </span>
              ) : null}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 100,
      },
      {
        id: "ai_requests",
        accessorKey: "ai_requests",
        header: "AI requests",
        filter: "number",
        align: "right",
        cell: (row) =>
          row.ai_requests > 0 ? (
            <span className="text-xs tabular-nums">
              {formatCount(row.ai_requests)}
              {row.ai_requests_7d > 0 ? (
                <span
                  className="ml-1 text-muted-foreground"
                  title="In the last 7 days"
                >
                  ({formatCount(row.ai_requests_7d)} 7d)
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 120,
      },
      {
        id: "ai_active_days",
        accessorKey: "ai_active_days",
        header: "Active days",
        filter: "number",
        align: "right",
        cell: (row) =>
          row.ai_active_days > 0 ? (
            <span
              className="text-xs tabular-nums"
              title={`First AI use ${fmtDate(row.first_ai_activity)}`}
            >
              {formatCount(row.ai_active_days)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 100,
      },
      {
        id: "last_ai_activity",
        accessorKey: "last_ai_activity",
        header: "Last AI use",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {fmtDate(row.last_ai_activity)}
          </span>
        ),
        width: 110,
      },
      {
        id: "ai_cost",
        accessorKey: "ai_cost",
        header: "AI cost",
        filter: "number",
        align: "right",
        cell: (row) => (
          <Cost
            usd={row.ai_cost > 0 ? row.ai_cost : null}
            short
            className="text-xs text-muted-foreground"
          />
        ),
        width: 150,
      },
      {
        id: "source",
        accessorKey: "source",
        header: "Source",
        filter: "select",
        cell: (row) =>
          row.source ? (
            <span
              className="block max-w-[140px] truncate text-xs"
              title={row.landing ?? undefined}
            >
              {row.source}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 130,
      },
      {
        id: "client",
        accessorKey: "client",
        header: "Client",
        filter: "select",
        cell: (row) =>
          row.client ? (
            <span className="block max-w-[150px] truncate text-xs">
              {row.client}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 150,
      },
      {
        id: "landing",
        accessorKey: "landing",
        header: "Landing page",
        hidden: true,
        cell: (row) =>
          row.landing ? (
            <span className="block max-w-[220px] truncate text-xs">
              {row.landing}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 220,
      },
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
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div className="flex max-w-[280px] items-center gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                {row.organizations
                  .slice(0, ORG_CELL_VISIBLE)
                  .map((organization, index, shown) => (
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
                      {index < shown.length - 1 ? (
                        <span className="text-muted-foreground">,</span>
                      ) : null}
                    </span>
                  ))}
                {row.organizations.length > ORG_CELL_VISIBLE ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        +{row.organizations.length - ORG_CELL_VISIBLE} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="max-h-72 w-72 overflow-y-auto p-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ul className="flex flex-col gap-1">
                        {row.organizations.map((organization) => (
                          <li key={organization.id} className="text-xs">
                            <EntityRef
                              token="organization"
                              id={organization.id}
                              name={organization.name}
                              showIcon={false}
                            />
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <button
                type="button"
                title="View this user's organizations"
                aria-label="View this user's organizations"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  pushAppHref(router, `/administration/users/organizations?user=${row.id}`,
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
        id: "mcp_full_access",
        header: "MCP access",
        accessorFn: (row) => Boolean(row.admin_level) || row.mcp_full_access,
        filter: "boolean",
        cell: (row) =>
          row.admin_level ? (
            <Badge variant="outline">Admin</Badge>
          ) : row.mcp_full_access ? (
            <Badge variant="default">Granted</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Off</span>
          ),
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
          <span className="text-xs">
            {row.onboarding_completed ? "Yes" : "New"}
          </span>
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
        hidden: true,
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
  }, [router, researchByUser, researchError, setResearchTarget]);

  // Derived, never stored: a deep link that arrives after load and one that
  // arrives before it resolve identically, and closing the focus cannot fight a
  // seeding effect.
  const focusedUser = focusedUserId
    ? (rows.find((row) => row.id === focusedUserId) ?? null)
    : null;
  // A focused account always shows, whatever segment it falls in — the admin
  // asked for that one record by id.
  // Your own category (friend, employee, test…) outranks the automatic guess.
  const classifiedRows = rows.map((row) => {
    const category = researchByUser.get(row.id)?.category;
    return withOwnerCategory(
      row,
      category,
      category ? RELATIONSHIP_LABELS[category] : undefined,
    );
  });
  const segmentCounts = Object.fromEntries(
    ACCOUNT_SEGMENTS.map((entry) => [
      entry.id,
      classifiedRows.filter((row) => rowInSegment(row, entry.id)).length,
    ]),
  ) as Record<AccountSegment, number>;
  const visibleRows = focusedUserId
    ? classifiedRows.filter((row) => row.id === focusedUserId)
    : classifiedRows.filter((row) => rowInSegment(row, segment));

  function selectSegment(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_ACCOUNT_SEGMENT) params.delete("segment");
    else params.set("segment", next);
    const query = params.toString();
    pushAddressWithoutNavigating(query ? `${pathname}?${query}` : pathname);
  }
  // The roster loaded and the requested account is not in it. Saying "no
  // accounts match your filters" here would blame a filter for a record that
  // simply is not in this list.
  const focusMissed = Boolean(
    focusedUserId && !loading && !error && focusedUser === null,
  );

  // How many accounts survive the admin's current query. Computed with the
  // table's OWN engine over the table's OWN inputs, so the number the surface
  // emits cannot drift from the number the table renders — a re-implemented
  // count would be a second source of truth that silently disagrees the first
  // time a filter kind is added.
  const matchingRows = useMemo(
    () =>
      filterAndSortRows(
        visibleRows,
        columns.filter((column) => !column.hidden),
        tableQuery.state.columnFilters,
        tableQuery.state.sort,
        tableQuery.state.search,
        undefined,
        tableQuery.state.layeredFilters,
        tableQuery.state.searchMatchMode,
      ),
    [visibleRows, columns, tableQuery.state],
  );

  function clearUserFocus() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("user");
    const query = params.toString();
    // Discrete close — Back re-opens the user the admin was just reading.
    pushAddressWithoutNavigating(query ? `${pathname}?${query}` : pathname);
  }

  return (
    // The roster's agent emitter. `getScope` is SYNCHRONOUS over the live
    // render state above — the Surface Context window polls it every 400ms
    // while it is open, so a build step that fetched would hammer
    // /api/admin/users behind a panel that looks idle.
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_USERS_SURFACE_NAME}
      getScope={() =>
        buildAdminUsersScope({
          rows,
          loading,
          error,
          focusedUserId,
          focusedUser,
          focusMissed,
          matchingCount: matchingRows.length,
          search: tableQuery.state.search,
          columnFilters: tableQuery.state.columnFilters,
          sort: tableQuery.state.sort,
          page: tableQuery.state.page,
          pageSize: tableQuery.state.pageSize,
          dmRecipientId: dmTarget?.id ?? null,
          dmDraft: dmContent,
        })
      }
    >
    <div className="flex h-full flex-col gap-3 p-4">
      {/* The read's failure is said once, by the table (read=). */}

      {focusedUserId ? (
        <div
          data-surface-value="focused_user"
          className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <UserRound className="h-4 w-4 shrink-0 text-primary" />
            {/* read-gate-exempt: focusMissed is true only after the accounts read succeeded (!loading && !error) */}
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
          <Button icon={<X />} variant="quiet" onClick={clearUserFocus}> Show all accounts
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1" data-surface-value="visible_user_count">
        <NonEditableContextMenu
          sourceFeature="admin"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(element) => {
            const id = element
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = id ? (visibleRows.find((r) => r.id === id) ?? null) : null;
            setClickedRow(row);
            if (!row) return null;
            return {
              content: [
                `${row.display_name ?? "(no name)"} <${row.email ?? "no-email"}>`,
                `id=${row.id}`,
                row.admin_level ? `admin=${row.admin_level}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            };
          }}
          extraSections={[
            buildAdminUserMenuSection(
              clickedRow
                ? {
                    id: clickedRow.id,
                    email: clickedRow.email,
                    displayName: clickedRow.display_name,
                  }
                : null,
            ),
          ]}
        >
        <MatrxDataTable
          data={visibleRows}
          columns={[...(columns), { id: "custom-actions", header: "Manage", sortable: false, filter: false, customActions: (row) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  icon={<MoreHorizontal />} aria-label="Actions"
                  variant="quiet"
                  title="Actions"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">
                  {row.email ?? row.id}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setResearchTarget(row)}>
                  <UserRound className="mr-2 h-4 w-4" /> Personal notes
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    pushAppHref(router, `/administration/users/organizations?user=${row.id}`,
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
                    pushAppHref(router, `/administration/users/email?userId=${row.id}`)
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
                    pushAppHref(router, `/administration/users/preferences?user=${row.id}`,
                    )
                  }
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" /> Preferences
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    pushAppHref(router, usagePersonHref(row.id))
                  }
                >
                  <Gauge className="mr-2 h-4 w-4" /> Usage & cost
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    pushAppHref(router, `/administration/users/admins?user=${row.id}`)
                  }
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Admin level
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={row.is_anonymous}
                  onClick={() =>
                    setPlanTarget({
                      kind: "user",
                      id: row.id,
                      name: row.display_name ?? row.email ?? row.id,
                      currentPlanKey: row.plan?.key ?? null,
                      grantActive: row.plan?.source === "grant",
                    })
                  }
                >
                  <WalletCards className="mr-2 h-4 w-4" /> Change plan…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={row.is_anonymous}
                  onClick={() =>
                    setFreeMonthsPeople([{ id: row.id, label: row.display_name ?? row.email ?? row.id }])
                  }
                >
                  <Gift className="mr-2 h-4 w-4" /> Give free months…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={row.is_anonymous}
                  onClick={() =>
                    setTutorialPerson({ id: row.id, label: row.display_name ?? row.email ?? row.id, email: row.email })
                  }
                >
                  <GraduationCap className="mr-2 h-4 w-4" /> Send a tutorial…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void toggleMcpFullAccess(row)}
                  disabled={Boolean(row.admin_level)}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  {row.admin_level
                    ? "MCP access inherited from admin"
                    : row.mcp_full_access
                      ? "Revoke full MCP access"
                      : "Grant full MCP access"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void toggleOnboarding(row)}>
                  <UserCog className="mr-2 h-4 w-4" />
                  {row.onboarding_completed
                    ? "Mark as new"
                    : "Mark as onboarded"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={row.erased || row.id === researchOwnerId}
                  onClick={() => void setAccountClosed(row, !row.banned)}
                >
                  {row.erased ? (
                    <UserX className="mr-2 h-4 w-4" />
                  ) : row.banned ? (
                    <UserCheck className="mr-2 h-4 w-4" />
                  ) : (
                    <UserX className="mr-2 h-4 w-4" />
                  )}
                  {row.erased
                    ? "Erased — cannot reopen"
                    : row.id === researchOwnerId
                      ? "Your own account"
                      : row.banned
                        ? "Reopen account"
                        : "Close account…"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) }]}
          getRowId={(r) => r.id}
          isLoading={loading}
          pageSize={ROSTER_PAGE_SIZE}
          // Local filtering, caller-owned query — see `tableQuery` above.
          query={{
            mode: "controlled-local",
            state: tableQuery.state,
            onStateChange: tableQuery.onStateChange,
          }}
          // A focused id that is not in the roster must NOT be reported as a
          // filter miss — that blames a control the user never touched for a
          // record that simply is not in this list. The banner above says what
          // actually happened; this only has to stop contradicting it.
          selection={{
            selectedIds: selectedUserIds,
            onSelectedIdsChange: setSelectedUserIds,
            isRowSelectable: (row) => !row.is_anonymous,
            noun: "account",
            actions: (selected) => (
              <Button
                icon={<Gift />}
                variant="outline"
                disabled={selected.length === 0}
                onClick={() =>
                  setFreeMonthsPeople(
                    selected.map((row) => ({ id: row.id, label: row.display_name ?? row.email ?? row.id })),
                  )
                }
              > Give free months…
              </Button>
            ),
          }}
          read={readOf({ loading, error }, { what: "user accounts" })}
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
          viewTabsStore={{
            views: viewPrefs.savedViews ?? [],
            onChange: (savedViews) => setViewPrefs({ savedViews }),
          }}
          summary={{
            metrics: [
              {
                id: "accounts",
                label: "Accounts",
                value: ({ rows: shown }) => formatCount(shown.length),
              },
              {
                id: "signed_in",
                label: "Signed in",
                value: ({ rows: shown }) =>
                  formatCount(shown.filter((row) => !row.is_anonymous && row.last_sign_in_at).length),
              },
              {
                id: "used_ai",
                label: "Used AI",
                value: ({ rows: shown }) =>
                  formatCount(shown.filter((row) => row.ai_requests > 0).length),
              },
              {
                id: "active_7d",
                label: "Active this week",
                value: ({ rows: shown }) =>
                  formatCount(shown.filter((row) => row.ai_requests_7d > 0).length),
              },
              {
                id: "ai_cost",
                label: "AI cost",
                value: ({ rows: shown }) =>
                  costDisplay.format(
                    shown.reduce((sum, row) => sum + row.ai_cost, 0) || null,
                    { short: true },
                  ),
              },
            ],
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search name, email, id…",
            facets: focusedUserId
              ? []
              : [
                  {
                    type: "button-group",
                    id: "segment",
                    value: segment,
                    defaultValue: DEFAULT_ACCOUNT_SEGMENT,
                    options: ACCOUNT_SEGMENTS.map((entry) => ({
                      value: entry.id,
                      label: `${entry.label} ${formatCount(segmentCounts[entry.id])}`,
                    })),
                    onChange: selectSegment,
                  },
                ],
            actions: (
              <Button
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
                `providers=${r.providers.join("/") || "none"} confirmed=${r.email_confirmed} onboarded=${r.onboarding_completed} mcp_full_access=${Boolean(r.admin_level) || r.mcp_full_access}`,
                `kind=${r.kind} (${r.kind_reason}) stage=${r.stage} plan=${r.plan ? `${r.plan.key} (${r.plan.source}) usage=${r.plan.state}` : "unknown"} ai_requests=${r.ai_requests} ai_requests_7d=${r.ai_requests_7d} ai_cost=${costDisplay.format(r.ai_cost)} source=${r.source ?? "unknown"} client=${r.client ?? "unknown"}`,
                `created=${r.created_at ?? "?"} last_sign_in=${r.last_sign_in_at ?? "never"}`,
                `organizations=${r.organizations.map((organization) => `${organization.name}:${organization.role}`).join(",") || "none"}`,
              ]
                .filter(Boolean)
                .join("\n"),
            rowAttributes: (r) => ({
              id: r.id,
              email: r.email,
              admin_level: r.admin_level,
              mcp_full_access: Boolean(r.admin_level) || r.mcp_full_access,
              mcp_full_access_grant: r.mcp_full_access,
              onboarded: r.onboarding_completed,
              kind: r.kind,
              stage: r.stage,
              ai_requests: r.ai_requests,
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
              segment,
              ...(focusedUserId ? { focused_user_id: focusedUserId } : {}),
            }),
          }}

        />
        </NonEditableContextMenu>
      </div>

      {plansError && <ErrorNotice size="inline" message="Plans and usage could not load. Refresh to retry." error={plansError} operation="Load account plans" calls={["users.admin_account_plans"]} />}
      <GiveFreeMonthsDialog
        open={freeMonthsPeople !== null}
        people={freeMonthsPeople ?? []}
        onClose={() => setFreeMonthsPeople(null)}
        onApplied={() => setRefreshKey((key) => key + 1)}
      />
      <SendTutorialDialog person={tutorialPerson} onClose={() => setTutorialPerson(null)} />
      <ChangePlanDialog
        subject={planTarget}
        onClose={() => setPlanTarget(null)}
        onChanged={() => setRefreshKey((key) => key + 1)}
      />
      {researchError && <ErrorNotice size="inline" message="Personal notes could not load. Refresh to retry." error={researchError} operation="Load personal user notes" calls={["crm.party_research"]} />}
      {researchTarget && researchOwnerId && <UserResearchDialog
        key={researchTarget.id} row={researchTarget} ownerId={researchOwnerId}
        existing={researchByUser.get(researchTarget.id) ?? null}
        sharedOrganizations={researchTarget.id === researchOwnerId ? [] : researchTarget.organizations.filter(org => ownerOrganizations.has(org.id)).map(org => org.name)}
        onClose={() => setResearchTarget(null)}
        onSaved={record => setResearch(records => [...records.filter(current => current.subject_id !== record.subject_id), record])}
      />}
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
            Sends a direct message from you into the user&apos;s in-app inbox
            (the DM system). They see it in Messages.
          </p>
          <ProTextarea
            data-surface-value="dm_draft"
            value={dmContent}
            onChange={(e) => setDmContent(e.target.value)}
            placeholder="Write your message…"
            rows={5}
            className="resize-none"
            autoFocus
          />
          <DialogFooter>
            <Button variant="quiet" onClick={() => setDmTarget(null)}>
              Cancel
            </Button>
            <Button
              icon={dmSending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MessageSquare />
              )}
              variant="primary"
              onClick={() => void sendDm()}
              disabled={dmSending || !dmContent.trim()}
            >
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </SurfaceRuntimeProvider>
  );
}

// THE ROSTER COUNTED (lane DRILL-WAVE2-B): the roster is paged 50 at a time and mostly editing, so it
// stays the first screen; one control opens the declared definition `account_roster` — accounts, AI cost
// and requests by plan, by where they came from and by signup month, counted on the database.
export function AccountsTableClient() {
  return (
    <DrillOrList
      definition="account_roster"
      listLabel="Accounts"
      firstScreen="list"
      list={<AccountsRoster />}
      renderDrill={(extras) => (
        <DrillExplorer
          source={{ kind: "entity", token: "account_roster" }}
          lane="platform"
          // org-fallback-deliberate: the platform lane of an admin explorer asks in the platform's own organization (its calendar is UTC)
          organizationId={SYSTEM_ORGANIZATION_ID}
          timeZone="UTC"
          title="Accounts"
          rootLabel="All accounts"
          names={{ person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person") }}
          headline={{ measure: "accounts", also: ["cost", "requests"] }}
          rowNoun="account"
          countMeasure="accounts"
          location="Administration › Users › Accounts"
          headerExtras={extras}
          dataAttributes={{ "data-account-roster-drill": "" }}
        />
      )}
    />
  );
}
