"use client";

// features/mandates/status/MandateStatusControl.tsx
//
// The mandate's status WITH the way to change it — for a viewer who may.
// A viewer who may not change it sees the badge alone: the control is
// absent, never disabled-looking (law 4).
//
//   draft    → Set a Mandate Holder (the host opens its holder surface) ·
//              Disable · Archive
//   active   → Disable · Archive
//   disabled → Enable · Archive
//   archived → nothing here; it is restored from Trash.
//
// Enable/Disable write `is_enabled`; Archive is the one soft delete
// (`softDeleteMandate`). Both writes fire the mandate cache bus, so every
// mounted surface re-reads.

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleOff, Archive, UserCog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import {
  softDeleteMandate,
  updateMandateDefinition,
} from "@/features/mandates/admin/service";
import type { StatusBadgeSize } from "@/components/official/status-badge/StatusBadge";
import { cn } from "@/lib/utils";
import { MandateStatusBadge } from "./MandateStatusBadge";
import { MANDATE_STATUS_META, type MandateStatus } from "./mandate-status";

export interface MandateStatusControlProps {
  mandateId: string;
  /** The person-readable name, used in confirmations and toasts. */
  name: string;
  status: MandateStatus;
  /** Whether THIS viewer may change the job's status. False = badge only. */
  canManage: boolean;
  /** Draft only: open the host's Mandate Holder surface. Omitted = no item. */
  onSetHolder?: () => void;
  /** After a successful change (the cache bus also fires). */
  onChanged?: (next: MandateStatus) => void;
  size?: StatusBadgeSize;
  className?: string;
}

export function MandateStatusControl({
  mandateId,
  name,
  status,
  canManage,
  onSetHolder,
  onChanged,
  size = "lg",
  className,
}: MandateStatusControlProps) {
  const [busy, setBusy] = useState(false);

  if (!canManage || status === "archived") {
    return <MandateStatusBadge status={status} size={size} className={className} />;
  }

  const setEnabled = async (enabled: boolean) => {
    if (!enabled) {
      const ok = await confirm({
        title: `Disable ${name}?`,
        description:
          "Nothing will run this job for anyone — every button, shortcut and page that uses it will refuse until it is enabled again. Its settings and bindings are kept.",
        confirmLabel: "Disable",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await updateMandateDefinition(mandateId, { is_enabled: enabled });
      toast.success(`${name} ${enabled ? "enabled" : "disabled"}.`);
      onChanged?.(enabled ? "active" : "disabled");
    } catch (error) {
      toast.error(
        `Could not ${enabled ? "enable" : "disable"} ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: `Archive ${name}?`,
      description:
        "It disappears from every list and stops running everywhere, together with its bindings, notes and test cases. Nothing is destroyed: it can be restored from Trash.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await softDeleteMandate(mandateId);
      toast.success(`${name} archived. Restore it from Trash.`);
      onChanged?.("archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`Status: ${MANDATE_STATUS_META[status].label}. Change status`}
          className={cn(
            "group inline-flex items-center gap-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
            busy && "opacity-60",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MandateStatusBadge status={status} size={size} />
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="max-w-64 text-xs font-normal text-muted-foreground">
          {MANDATE_STATUS_META[status].meaning}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {status === "draft" && onSetHolder ? (
          <DropdownMenuItem onSelect={() => onSetHolder()}>
            <UserCog className="mr-2 h-4 w-4" />
            Set a Mandate Holder
          </DropdownMenuItem>
        ) : null}
        {status === "disabled" ? (
          <DropdownMenuItem onSelect={() => void setEnabled(true)}>
            <CircleCheck className="mr-2 h-4 w-4 text-emerald-600" />
            Enable
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void setEnabled(false)}>
            <CircleOff className="mr-2 h-4 w-4 text-rose-600" />
            Disable
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void archive()}>
          <Archive className="mr-2 h-4 w-4" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
