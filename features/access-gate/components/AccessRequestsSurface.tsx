"use client";

/**
 * AccessRequestsSurface — the inbox for `iam.access_requests`, both directions.
 *
 * Why it exists: the request row is the durable fact and the DM is only how it
 * gets NOTICED. Until this page, the DM was the only place an ask was ever
 * visible — so a request whose delivery failed, or one filed while the sender
 * had no signed-in session to message from, became a row nobody on earth could
 * see or answer. This is the surface that makes the row reachable.
 *
 * It deliberately does NOT reimplement the decision: the same
 * `decideAccessRequest` / `reportAccessRequest` / `withdrawAccessRequest` the DM
 * chips call are called here, so grant-and-notify behaves identically in both
 * places and can never drift.
 *
 * Not built on `lib/entity-list`: that shell's contract is a server-side
 * scoped/sorted/filtered/faceted RPC over the five-scope vocabulary
 * (mine/orgs/shared/public). `access_request_list(p_box)` is a two-box,
 * unpaged, authorization-derived list — an inbox, not an entity list — and
 * satisfying the shell would mean inventing an `access_request_list_scoped`
 * family for a set that is small by construction.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CircleCheck,
  CircleSlash,
  Flag,
  Inbox,
  KeyRound,
  PenLine,
  Send,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { UserIdentity } from "@/components/user/UserIdentity";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import {
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { relativeTime } from "@/lib/entity-list/columns";
import {
  decideAccessRequest,
  listAccessRequests,
  reportAccessRequest,
  withdrawAccessRequest,
} from "@/features/access-gate/service/accessRequests";
import type {
  AccessRequestRow,
  AccessRequestStatus,
} from "@/features/access-gate/types";

type Box = "inbox" | "sent";

const STATUS_LABEL: Record<AccessRequestStatus, string> = {
  pending: "Pending",
  granted: "Granted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  reported: "Reported",
};

const STATUS_TONE: Record<AccessRequestStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  granted: "bg-primary/10 text-primary",
  declined: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
  reported: "bg-destructive/10 text-destructive",
};

function boxFromParam(value: string | null): Box {
  return value === "sent" ? "sent" : "inbox";
}

/**
 * BOTH boxes, every time. The tab the user is not standing on still has to
 * show an honest count — a badge that only becomes true once you click the tab
 * is exactly the kind of small lie this feature exists to stop.
 *
 * Module-level and state-free on purpose: the mount effect can then await it
 * and set state in the callback, instead of calling a setState-bearing helper
 * synchronously inside the effect body (React Compiler's
 * `react-hooks/set-state-in-effect`).
 */
async function fetchBoxes(): Promise<{
  rows: Record<Box, AccessRequestRow[]>;
  error: string | null;
}> {
  try {
    const [inbox, sent] = await Promise.all([
      listAccessRequests("inbox"),
      listAccessRequests("sent"),
    ]);
    return { rows: { inbox, sent }, error: null };
  } catch (e) {
    return {
      rows: { inbox: [], sent: [] },
      error:
        e instanceof Error
          ? e.message
          : "We couldn't load your access requests.",
    };
  }
}

/** The record the ask is about. A door where one resolves, plain text where not. */
function EntityCell({ row }: { row: AccessRequestRow }) {
  const label = row.entityLabel ?? "Item";
  if (!row.entityTitle) {
    // No title to show, and an 8-character uuid stem is not a name. Say the
    // kind and stop — never print an id the user cannot open.
    return (
      <span className="text-sm text-muted-foreground">
        Untitled {label.toLowerCase()}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {/* Renders as plain text when no route resolves for this token — the
          component decides, so this surface can never invent a dead link. */}
      <EntityRef
        token={row.resourceType}
        id={row.resourceId}
        name={row.entityTitle}
        showIcon={false}
        className="min-w-0 font-medium"
      />
    </span>
  );
}

function RowShell({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      {children}
    </li>
  );
}

function LoadingRows() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2].map((i) => (
        <RowShell key={i}>
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </RowShell>
      ))}
    </ul>
  );
}

function EmptyState({ box }: { box: Box }) {
  const Icon = box === "inbox" ? Inbox : Send;
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        {box === "inbox"
          ? "Nothing waiting on you"
          : "You haven't asked for anything"}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {box === "inbox"
          ? "When someone asks to open something you own, it lands here — and in your messages."
          : "When you open something you don't have access to yet, you can ask the owner from there. Your request shows up here."}
      </p>
    </div>
  );
}

export function AccessRequestsSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const box = boxFromParam(searchParams.get("box"));
  const currentUserId = useAppSelector(selectUserId);

  const [rows, setRows] = useState<Record<Box, AccessRequestRow[] | null>>({
    inbox: null,
    sent: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const result = await fetchBoxes();
    setRows(result.rows);
    setError(result.error);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await fetchBoxes();
      if (!alive) return;
      setRows(result.rows);
      setError(result.error);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const current = rows[box];
  // The inbox RPC returns ONLY pending asks I am entitled to answer, so its
  // length IS the count of things waiting on me.
  const inboxCount = rows.inbox?.length ?? 0;
  const sentPending =
    rows.sent?.filter((r) => r.status === "pending").length ?? 0;

  async function run(id: string, work: () => Promise<void>, done: string) {
    setBusyId(id);
    try {
      await work();
      toast.success(done);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't do that.");
    } finally {
      setBusyId(null);
    }
  }

  function decide(row: AccessRequestRow, level: "viewer" | "editor") {
    void run(
      row.id,
      async () => {
        await decideAccessRequest({
          requestId: row.id,
          decision: "grant",
          level,
          currentUserId,
        });
      },
      `Access granted${row.entityTitle ? ` to ${row.entityTitle}` : ""}.`,
    );
  }

  async function decline(row: AccessRequestRow) {
    const ok = await confirm({
      title: "Decline this request?",
      description:
        "They'll be told you said no. They can ask again later if something changes.",
      confirmLabel: "Decline",
    });
    if (!ok) return;
    void run(
      row.id,
      async () => {
        await decideAccessRequest({
          requestId: row.id,
          decision: "decline",
          currentUserId,
        });
      },
      "Request declined.",
    );
  }

  async function report(row: AccessRequestRow) {
    const ok = await confirm({
      title: "Report this request?",
      description:
        "This ends the conversation for good — they won't be able to ask about this again.",
      confirmLabel: "Report",
      variant: "destructive",
    });
    if (!ok) return;
    void run(
      row.id,
      async () => {
        await reportAccessRequest(row.id);
      },
      "Reported. They can't ask about this again.",
    );
  }

  async function withdraw(row: AccessRequestRow) {
    const ok = await confirm({
      title: "Withdraw your request?",
      description: "The owner will no longer see it waiting for an answer.",
      confirmLabel: "Withdraw",
    });
    if (!ok) return;
    void run(
      row.id,
      async () => {
        await withdrawAccessRequest(row.id);
      },
      "Request withdrawn.",
    );
  }

  const tab = (target: Box, label: string, count: number) => (
    <button
      key={target}
      type="button"
      onClick={() =>
        router.replace(
          target === "inbox"
            ? "/settings/access-requests"
            : "/settings/access-requests?box=sent",
          { scroll: false },
        )
      }
      aria-current={box === target ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
        box === target ? NAV_ITEM_SELECTED : NAV_ITEM_UNSELECTED,
      )}
    >
      {target === "inbox" ? (
        <Inbox className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Send className="h-3.5 w-3.5" aria-hidden />
      )}
      {label}
      {count > 0 && (
        <Badge className="pointer-events-none h-4 min-w-[16px] border-0 bg-primary px-1 text-[9px] font-semibold hover:bg-primary">
          {count > 99 ? "99+" : count}
        </Badge>
      )}
    </button>
  );

  return (
    <>
      <RouteHeader
        left={
          // The title text steps out below `sm`: the mobile header budget is
          // identity + ONE control, and a long title there squeezes the tab
          // pill until the two overlap. The icon keeps the identity.
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Access requests</span>
            <span className="sr-only sm:hidden">Access requests</span>
          </span>
        }
        center={
          // RouteHeader's center slot is a full-width absolutely-centered box:
          // the pill has to center ITSELF inside it, or it sits at the slot's
          // left edge and lands on top of the title.
          <div className="flex w-full justify-center">
            <div className="matrx-glass-thin-border inline-flex items-center gap-1 rounded-full p-1">
              {tab("inbox", "To me", inboxCount)}
              {tab("sent", "I sent", sentPending)}
            </div>
          </div>
        }
        right={
          <RefreshCwTapButton
            ariaLabel="Refresh access requests"
            disabled={refreshing}
            onClick={() => void refresh()}
          />
        }
      />

      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 pb-10 pt-[var(--shell-header-h)] sm:px-4">
          {error && (
            <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* An error is never dressed up as an empty inbox: "nothing waiting
              on you" when the read failed is the same class of lie this whole
              feature exists to kill. */}
          {error ? null : current === null ? (
            <LoadingRows />
          ) : current.length === 0 ? (
            <EmptyState box={box} />
          ) : (
            <ul className="space-y-2">
              {current.map((row) => (
                <RowShell key={row.id}>
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        {box === "inbox" && (
                          <UserIdentity
                            user={{
                              id: row.requester?.userId,
                              displayName: row.requester?.displayName,
                              avatarUrl: row.requester?.avatarUrl,
                            }}
                            size="sm"
                            subtitle={false}
                            avatarOnly
                          />
                        )}
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm text-foreground">
                            {box === "inbox" ? (
                              <span className="font-medium">
                                {row.requester?.displayName ?? "Someone"}
                              </span>
                            ) : (
                              <span className="font-medium">You</span>
                            )}{" "}
                            asked to{" "}
                            {row.requestedLevel === "editor" ? "edit" : "view"}
                          </p>
                          <EntityCell row={row} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {box === "sent" && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              STATUS_TONE[row.status],
                            )}
                          >
                            {STATUS_LABEL[row.status]}
                          </span>
                        )}
                        {row.createdAt && (
                          <span
                            className="text-xs tabular-nums text-muted-foreground"
                            title={new Date(row.createdAt).toLocaleString()}
                          >
                            {relativeTime(row.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {row.message && (
                      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {row.message}
                      </p>
                    )}

                    {box === "sent" && row.decisionNote && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Their note:
                        </span>{" "}
                        {row.decisionNote}
                      </p>
                    )}

                    {box === "inbox" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-11 sm:h-8"
                          disabled={busyId === row.id}
                          onClick={() => decide(row, "viewer")}
                        >
                          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                          Let them view
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 sm:h-8"
                          disabled={busyId === row.id}
                          onClick={() => decide(row, "editor")}
                        >
                          <PenLine className="h-3.5 w-3.5" aria-hidden />
                          Let them edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 sm:h-8"
                          disabled={busyId === row.id}
                          onClick={() => void decline(row)}
                        >
                          <CircleSlash className="h-3.5 w-3.5" aria-hidden />
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 text-muted-foreground sm:h-8"
                          disabled={busyId === row.id}
                          onClick={() => void report(row)}
                        >
                          <Flag className="h-3.5 w-3.5" aria-hidden />
                          Report
                        </Button>
                      </div>
                    ) : (
                      row.status === "pending" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-11 sm:h-8"
                            disabled={busyId === row.id}
                            onClick={() => void withdraw(row)}
                          >
                            <Undo2 className="h-3.5 w-3.5" aria-hidden />
                            Withdraw
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                </RowShell>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default AccessRequestsSurface;
