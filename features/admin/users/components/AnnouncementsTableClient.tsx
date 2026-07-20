"use client";

// Users & Access › Announcements.
//
// System-wide announcements (broadcast to every user on next login) managed
// from the user hub — the natural home alongside DMs and accounts. Canonical
// MatrxDataTable + the existing announcement CRUD. NOT feedback (that's the
// separate bug tracker).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import CreateAnnouncementDialog from "@/app/(admin)/administration/feedback/components/CreateAnnouncementDialog";
import {
  getAllAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
} from "@/actions/feedback.actions";
import type { SystemAnnouncement } from "@/types/feedback.types";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { USERS_ADMIN_LOCATION } from "../constants";

const TYPE_CLASS: Record<string, string> = {
  info: "text-sky-600 border-sky-500/40 bg-sky-500/10",
  warning: "text-amber-600 border-amber-500/40 bg-amber-500/10",
  critical: "text-rose-600 border-rose-500/40 bg-rose-500/10",
  update: "text-violet-600 border-violet-500/40 bg-violet-500/10",
};

export function AnnouncementsTableClient() {
  const [rows, setRows] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getAllAnnouncements();
    if (res.success) setRows(res.data ?? []);
    else setError(res.error ?? "Failed to load announcements");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = useCallback(
    async (row: SystemAnnouncement) => {
      const res = await updateAnnouncement(row.id, { is_active: !row.is_active });
      if (res.success) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)),
        );
        toast.success(row.is_active ? "Deactivated" : "Activated");
      } else {
        toast.error(res.error ?? "Failed");
      }
    },
    [],
  );

  const remove = useCallback(async (row: SystemAnnouncement) => {
    const ok = await confirm({
      title: "Delete announcement?",
      description: `"${row.title}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await deleteAnnouncement(row.id);
    if (res.success) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Deleted");
    } else {
      toast.error(res.error ?? "Failed");
    }
  }, []);

  const columns = useMemo((): MatrxColumnDef<SystemAnnouncement>[] => {
    return [
      { id: "title", accessorKey: "title", header: "Title", width: 220 },
      {
        id: "message",
        accessorKey: "message",
        header: "Message",
        cell: (r) => (
          <span className="line-clamp-2 text-xs text-muted-foreground">{r.message}</span>
        ),
      },
      {
        id: "announcement_type",
        accessorKey: "announcement_type",
        header: "Type",
        filter: "select",
        cell: (r) => (
          <Badge variant="outline" className={TYPE_CLASS[r.announcement_type] ?? ""}>
            {r.announcement_type}
          </Badge>
        ),
        width: 110,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        align: "center",
        cell: (r) => <span className="text-xs">{r.is_active ? "Yes" : "No"}</span>,
        width: 80,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
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
          emptyState={{
            title: "No announcements",
            description: "Broadcast a message to every user on their next login.",
            icon: <Megaphone className="h-6 w-6 text-muted-foreground" />,
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search announcements…",
            actions: (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New announcement
              </Button>
            ),
          }}
          copy={{
            label: "Announcement",
            listLabel: "Announcements (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "announcement",
            listKind: "announcements",
            humanRow: (r) =>
              `${r.title} [${r.announcement_type}${r.is_active ? ", active" : ""}]\n${r.message}`,
            rowAttributes: (r) => ({ id: r.id, type: r.announcement_type, active: r.is_active }),
          }}
          detail={{
            title: (r) => r.title,
            render: (r) => (
              <div className="space-y-3 p-4 text-sm">
                <Badge variant="outline" className={TYPE_CLASS[r.announcement_type] ?? ""}>
                  {r.announcement_type}
                </Badge>
                <p className="whitespace-pre-wrap">{r.message}</p>
                <p className="text-xs text-muted-foreground">
                  Min display: {r.min_display_seconds}s ·{" "}
                  {r.is_active ? "Active" : "Inactive"} · created{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
            ),
          }}
          rowActions={(row) => (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title={row.is_active ? "Deactivate" : "Activate"}
                onClick={() => void toggleActive(row)}
              >
                <Power className={row.is_active ? "h-3.5 w-3.5 text-emerald-500" : "h-3.5 w-3.5"} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Delete"
                onClick={() => void remove(row)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        />
      </div>

      <CreateAnnouncementDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}
