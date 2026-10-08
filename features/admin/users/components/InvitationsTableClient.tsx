"use client";

// Users & Access › Invitations — canonical MatrxDataTable over access requests.
// Sort/filter every column + Copy-for-AI; the approve/reject review flow lives
// in the side-panel detail. Data via /api/admin/invitation-requests.
//
// THE DOOR LAW (common-docs/policies/no-dead-ends.md): a request row names a
// person who does NOT yet have an account — `users.invitation_requests` has no
// user FK, and `/administration/users` (Accounts) reads no deep-link param — so
// the applicant's name and email genuinely have no record to open, and the
// request's own door is the detail panel the row opens. What IS resolvable is
// `reviewed_by`: the admin who approved or rejected it. The API already
// returned that column and the UI dropped it on the floor — a relationship you
// can resolve must be RENDERED and LINKED, so it is now a Reviewer column
// carrying `AdminUserRef`.

import { useCallback, useMemo, useState } from "react";
import { AdminUserRef } from "./AdminUserRef";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { USERS_ADMIN_LOCATION } from "../constants";
import { ProTextarea } from "@/components/official/ProTextarea";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { ContextMenuExtraItem } from "@/features/context-menu-v3/types";
import {
  serverTableInitialState,
  useServerTable,
} from "@/features/admin/shared/server-table/useServerTable";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

interface InvitationRequest {
  id: string;
  full_name: string;
  email: string;
  company: string;
  use_case: string;
  user_type: string;
  user_type_other?: string;
  phone?: string;
  biggest_obstacle?: string;
  referral_source?: string;
  current_ai_systems?: string;
  recent_project?: string;
  status: "pending" | "approved" | "rejected" | "invited" | "converted";
  notes?: string;
  created_at: string;
  /** The admin who approved/rejected this request (written by the PATCH route). */
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  pending: "text-amber-600 border-amber-500/40 bg-amber-500/10",
  approved: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  rejected: "text-rose-600 border-rose-500/40 bg-rose-500/10",
  invited: "text-sky-600 border-sky-500/40 bg-sky-500/10",
  converted: "text-violet-600 border-violet-500/40 bg-violet-500/10",
};

function summary(r: InvitationRequest): string {
  return [
    `Name: ${r.full_name}`,
    `Email: ${r.email}`,
    `Company: ${r.company}`,
    `Type: ${r.user_type === "other" ? r.user_type_other : r.user_type}`,
    `Status: ${r.status}`,
    `Use case: ${r.use_case}`,
    `Submitted: ${new Date(r.created_at).toLocaleString()}`,
  ].join("\n");
}

// Every search / filter / sort / page is answered by POST /api/admin/invitation-requests over ALL
// requests (see that route) — the table never filters a slice the browser happens to hold.
const INITIAL_STATE = serverTableInitialState({ id: "created_at", direction: "desc" });

async function fetchInvitationPage(
  state: MatrxDataTableQueryState,
): Promise<{ rows: InvitationRequest[]; total: number }> {
  const res = await fetch("/api/admin/invitation-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.msg ?? "Failed to load invitation requests");
  return { rows: (json.data ?? []) as InvitationRequest[], total: Number(json.total ?? 0) };
}

const USER_TYPE_OPTIONS = [
  "ai_prompt_engineer",
  "technical_lead",
  "product_manager",
  "business_executive",
  "research_scientist",
  "creative_professional",
  "consultant",
  "individual_hobbyist",
  "other",
].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

const STATUS_OPTIONS = ["pending", "approved", "rejected", "invited", "converted"].map((v) => ({
  value: v,
  label: v,
}));

export function InvitationsTableClient() {
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clickedRow, setClickedRow] = useState<InvitationRequest | null>(null);
  const {
    rows,
    reload: load,
    tableProps,
  } = useServerTable<InvitationRequest>(fetchInvitationPage, INITIAL_STATE, "invitation requests", "", "user-invitations");

  const act = useCallback(
    async (row: InvitationRequest, action: "approve" | "reject") => {
      setActing(true);
      try {
        const res = await fetch(`/api/admin/invitation-requests/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, notes, rejectionReason: reason }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.msg ?? "Action failed");
        if (json.data?.emailSent === false) {
          toast.warning(
            action === "approve"
              ? `Approved, but the code email to ${row.email} failed`
              : `Rejected, but the notification to ${row.email} failed`,
          );
        } else {
          toast.success(
            action === "approve"
              ? `Approved — code sent to ${row.email}`
              : `Rejected — notified ${row.email}`,
          );
        }
        setSelectedId(null);
        setNotes("");
        setReason("");
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      } finally {
        setActing(false);
      }
    },
    [notes, reason, load],
  );

  const columns = useMemo((): MatrxColumnDef<InvitationRequest>[] => {
    return [
      { id: "full_name", accessorKey: "full_name", header: "Name", filter: "text", width: 160 },
      { id: "company", accessorKey: "company", header: "Company", filter: "text", width: 150 },
      { id: "email", accessorKey: "email", header: "Email", filter: "text", width: 200 },
      {
        id: "user_type",
        header: "Type",
        accessorFn: (r) =>
          r.user_type === "other" ? r.user_type_other : r.user_type,
        filter: "select",
        filterOptions: USER_TYPE_OPTIONS,
        width: 120,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        filterOptions: STATUS_OPTIONS,
        cell: (r) => (
          <Badge variant="outline" className={STATUS_CLASS[r.status] ?? ""}>
            {r.status}
          </Badge>
        ),
        width: 110,
      },
      {
        id: "reviewed_by",
        accessorKey: "reviewed_by",
        header: "Reviewer",
        // The database has the reviewer's id only (no name to match); the cell resolves the
        // person by name + email. Filtering/sorting by an id would be a control nobody can use.
        filter: false,
        sortable: false,
        cell: (r) =>
          r.reviewed_by ? (
            <AdminUserRef userId={r.reviewed_by} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 150,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Submitted",
        filter: "date",
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleDateString()}
          </span>
        ),
        width: 110,
      },
    ];
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* The read's failure is said once, by the table (read=). */}
      <div className="min-h-0 flex-1">
        <NonEditableContextMenu
          sourceFeature="admin"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(element) => {
            const id = element
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = id ? (rows.find((r) => r.id === id) ?? null) : null;
            setClickedRow(row);
            if (!row) return null;
            return {
              [CONTEXT_MENU_ENTITY_KEY]: {
                type: "invitation_request",
                id: row.id,
                title: row.full_name,
              },
              content: summary(row),
            };
          }}
          extraSections={[
            {
              id: "invitation-actions",
              label: clickedRow?.full_name || "This request",
              anchor: "after-compare",
              items: [
                {
                  kind: "item",
                  id: "invitation-approve",
                  label: "Approve & send code",
                  icon: CheckCircle,
                  disabled: !clickedRow || clickedRow.status !== "pending",
                  onSelect: () =>
                    clickedRow && void act(clickedRow, "approve"),
                },
                {
                  kind: "item",
                  id: "invitation-reject",
                  label: "Reject request…",
                  icon: XCircle,
                  destructive: true,
                  disabled: !clickedRow || clickedRow.status !== "pending",
                  onSelect: () => clickedRow && void act(clickedRow, "reject"),
                },
              ] satisfies ContextMenuExtraItem[],
            },
          ]}
        >
        <MatrxDataTable
          {...tableProps}
          columns={columns}
          getRowId={(r) => r.id}
          selectedId={selectedId}
          onSelectedIdChange={(id) => {
            setSelectedId(id);
            const row = rows.find((r) => r.id === id);
            setNotes(row?.notes ?? "");
            setReason("");
          }}
          emptyState={{ title: "No invitation requests" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search name, email, company…",
            actions: (
              <Button variant="outline" onClick={load}>
                Refresh
              </Button>
            ),
          }}
          copy={{
            label: "Invitation request",
            listLabel: "Invitation requests (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "invitation-request",
            listKind: "invitation-requests",
            humanRow: summary,
            rowAttributes: (r) => ({
              id: r.id,
              status: r.status,
              email: r.email,
            }),
          }}
          detail={{
            title: (r) => r.full_name,
            description: (r) => r.email,
            defaultWidth: 460,
            render: (r) => (
              <div className="space-y-4 p-4 text-sm">
                <Badge
                  variant="outline"
                  className={STATUS_CLASS[r.status] ?? ""}
                >
                  {r.status}
                </Badge>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Company</dt>
                  <dd>{r.company || "—"}</dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>
                    {r.user_type === "other" ? r.user_type_other : r.user_type}
                  </dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{r.phone || "—"}</dd>
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd>{new Date(r.created_at).toLocaleString()}</dd>
                  {r.reviewed_by ? (
                    <>
                      <dt className="text-muted-foreground">Reviewed by</dt>
                      <dd>
                        <AdminUserRef userId={r.reviewed_by} />
                      </dd>
                    </>
                  ) : null}
                  {r.reviewed_at ? (
                    <>
                      <dt className="text-muted-foreground">Reviewed</dt>
                      <dd>{new Date(r.reviewed_at).toLocaleString()}</dd>
                    </>
                  ) : null}
                </dl>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Use case
                  </p>
                  <p className="text-sm">{r.use_case || "—"}</p>
                </div>
                {r.biggest_obstacle ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Biggest obstacle
                    </p>
                    <p className="text-sm">{r.biggest_obstacle}</p>
                  </div>
                ) : null}
                {r.current_ai_systems ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Current AI systems
                    </p>
                    <p className="text-sm">{r.current_ai_systems}</p>
                  </div>
                ) : null}
                {r.status === "pending" ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <ProTextarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Internal notes (optional)…"
                      rows={2}
                      className="resize-none"
                    />
                    <ProTextarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Rejection reason (sent if rejecting)…"
                      rows={2}
                      className="resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        icon={acting ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <XCircle />
                        )}
                        variant="danger"
                        disabled={acting}
                        onClick={() => void act(r, "reject")}
                      >
                        Reject
                      </Button>
                      <Button
                        icon={acting ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CheckCircle />
                        )}
                        variant="primary"
                        disabled={acting}
                        onClick={() => void act(r, "approve")}
                      >
                        Approve & send code
                      </Button>
                    </div>
                  </div>
                ) : r.notes ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Admin notes
                    </p>
                    <p className="text-sm text-muted-foreground">{r.notes}</p>
                  </div>
                ) : null}
              </div>
            ),
          }}
        />
        </NonEditableContextMenu>
      </div>
    </div>
  );
}
