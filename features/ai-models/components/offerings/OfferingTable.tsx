"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { AdminAuditTable } from "@/features/administration/canonicalization/components/AdminAuditTable";
import type { AuditColumnDef } from "@/features/administration/canonicalization/components/AdminAuditTable";
import type { AiModel, AiOffering, AiService } from "../../types";

interface OfferingTableProps {
  offerings: AiOffering[];
  models: AiModel[];
  services: AiService[];
  loading: boolean;
  onSelect: (offering: AiOffering) => void;
  onDelete: (offering: AiOffering) => void;
  onCreate: () => void;
}

export default function OfferingTable({
  offerings,
  models,
  services,
  loading,
  onSelect,
  onDelete,
  onCreate,
}: OfferingTableProps) {
  const [pendingDelete, setPendingDelete] = useState<AiOffering | null>(null);
  const modelName = (id: string) => {
    const m = models.find((x) => x.id === id);
    return m?.common_name || m?.name || id;
  };
  const serviceName = (id: string) => {
    const s = services.find((x) => x.id === id);
    return s?.display_name || id;
  };

  const columns: AuditColumnDef<AiOffering>[] = [
    {
      key: "model",
      label: "Model",
      type: "text",
      getValue: (o) => modelName(o.model_id),
      width: "minmax(180px,1.4fr)",
    },
    {
      key: "service",
      label: "Service",
      type: "enum",
      getValue: (o) => serviceName(o.service_id),
      width: "160px",
    },
    {
      key: "provider_model_id",
      label: "Provider Model ID",
      type: "text",
      getValue: (o) => o.provider_model_id,
      monospace: true,
      copyable: true,
      width: "minmax(200px,1.6fr)",
      noValueList: true,
    },
    {
      key: "priority",
      label: "Priority",
      type: "number",
      getValue: (o) => o.priority,
      width: "90px",
      align: "right",
    },
    {
      key: "is_available",
      label: "Available",
      type: "enum",
      getValue: (o) => (o.is_available ? "Yes" : "No"),
      width: "100px",
      render: (o) => (
        <Badge
          variant="outline"
          className={
            o.is_available
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300 text-[10px]"
              : "bg-muted text-muted-foreground text-[10px]"
          }
        >
          {o.is_available ? "Available" : "Unavailable"}
        </Badge>
      ),
    },
    {
      key: "usage_basis",
      label: "Usage Basis",
      type: "enum",
      getValue: (o) => o.usage_basis ?? "",
      width: "120px",
    },
    {
      key: "actions",
      label: "",
      type: "text",
      sortable: false,
      filterable: false,
      getValue: () => "",
      width: "56px",
      render: (o) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(o);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end">
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
          New Offering
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <AdminAuditTable
          rows={offerings}
          columns={columns}
          loading={loading}
          emptyMessage="No offerings yet."
          onRowClick={onSelect}
          csvFilename="ai_offerings"
        />
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offering?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  This removes the{" "}
                  <strong>{serviceName(pendingDelete.service_id)}</strong>{" "}
                  offering for{" "}
                  <strong>{modelName(pendingDelete.model_id)}</strong>. This
                  cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete Offering
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
