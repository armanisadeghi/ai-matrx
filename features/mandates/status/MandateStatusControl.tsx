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
import { errorSentence, toast } from "@/lib/toast";
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
  /** Admin feature "mandate.system-seat": this is a SYSTEM mandate and the viewer holds the seat. */
  systemSeat?: boolean;
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
  systemSeat = false,
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
          "Asking for this job is refused for everyone until it is enabled again. Settings and bindings are kept.",
        confirmLabel: "Disable",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await updateMandateDefinition(
        mandateId,
        { is_enabled: enabled },
        { systemSeat },
      );
      toast.success(`${name} ${enabled ? "enabled" : "disabled"}.`);
      onChanged?.(enabled ? "active" : "disabled");
    } catch (error) {
      toast.error(
        `Could not ${enabled ? "enable" : "disable"} ${name}: ${
          errorSentence(error)
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
        "It leaves every list with its bindings, notes and test cases, and asking for it is refused. You can restore from Trash.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await softDeleteMandate(mandateId, { systemSeat });
      toast.success(`${name} archived. Restore it from Trash.`);
      onChanged?.("archived");
    } catch (error) {
      toast.error(errorSentence(error));
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
            // Not a capsule itself: the ONE capsule is the badge inside (the pill
            // guard read a rounded wrapper as a stretched pill). The focus ring
            // is drawn on that capsule.
            "group inline-flex items-center outline-none",
            busy && "opacity-60",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* The chevron rides INSIDE the one capsule (StatusBadge `trailing`). */}
          <MandateStatusBadge
            status={status}
            size={size}
            className="group-focus-visible:ring-2 group-focus-visible:ring-ring"
            trailing={
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100"
                aria-hidden
              />
            }
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
