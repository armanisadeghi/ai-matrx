"use client";

// Users & Access › Invitations — canonical MatrxDataTable over access requests.
// Sort/filter every column + Copy-for-AI; the approve/reject review flow lives
// in the side-panel detail. Data via /api/admin/invitation-requests.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { USERS_ADMIN_LOCATION } from "../constants";

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

export function InvitationsTableClient() {
  const [rows, setRows] = useState<InvitationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invitation-requests?status=all&limit=200");
      const json = await res.json();
      if (!json.success) throw new Error("Failed to load invitation requests");
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        toast.success(
          action === "approve"
            ? `Approved — code sent to ${row.email}`
            : `Rejected — notified ${row.email}`,
        );
        setSelectedId(null);
        setNotes("");
        setReason("");
        await load();
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
      { id: "full_name", accessorKey: "full_name", header: "Name", width: 160 },
      { id: "company", accessorKey: "company", header: "Company", width: 150 },
      { id: "email", accessorKey: "email", header: "Email", width: 200 },
      {
        id: "user_type",
        header: "Type",
        accessorFn: (r) => (r.user_type === "other" ? r.user_type_other : r.user_type),
        filter: "select",
        width: 120,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        cell: (r) => (
          <Badge variant="outline" className={STATUS_CLASS[r.status] ?? ""}>
            {r.status}
          </Badge>
        ),
        width: 110,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Submitted",
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
              <Button size="sm" variant="outline" onClick={() => void load()}>
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
            rowAttributes: (r) => ({ id: r.id, status: r.status, email: r.email }),
          }}
          detail={{
            title: (r) => r.full_name,
            description: (r) => r.email,
            defaultWidth: 460,
            render: (r) => (
              <div className="space-y-4 p-4 text-sm">
                <Badge variant="outline" className={STATUS_CLASS[r.status] ?? ""}>
                  {r.status}
                </Badge>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Company</dt>
                  <dd>{r.company || "—"}</dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{r.user_type === "other" ? r.user_type_other : r.user_type}</dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{r.phone || "—"}</dd>
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd>{new Date(r.created_at).toLocaleString()}</dd>
                </dl>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Use case</p>
                  <p className="text-sm">{r.use_case || "—"}</p>
                </div>
                {r.biggest_obstacle ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Biggest obstacle</p>
                    <p className="text-sm">{r.biggest_obstacle}</p>
                  </div>
                ) : null}
                {r.current_ai_systems ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Current AI systems</p>
                    <p className="text-sm">{r.current_ai_systems}</p>
                  </div>
                ) : null}
                {r.status === "pending" ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Internal notes (optional)…"
                      rows={2}
                      className="resize-none"
                    />
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Rejection reason (sent if rejecting)…"
                      rows={2}
                      className="resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={acting}
                        onClick={() => void act(r, "reject")}
                      >
                        {acting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
                        Reject
                      </Button>
                      <Button size="sm" disabled={acting} onClick={() => void act(r, "approve")}>
                        {acting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1 h-3.5 w-3.5" />}
                        Approve & send code
                      </Button>
                    </div>
                  </div>
                ) : r.notes ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Admin notes</p>
                    <p className="text-sm text-muted-foreground">{r.notes}</p>
                  </div>
                ) : null}
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
