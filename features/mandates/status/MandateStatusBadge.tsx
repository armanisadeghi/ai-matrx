// features/mandates/status/MandateStatusBadge.tsx
//
// A mandate's status, drawn by THE canonical StatusBadge. Every mandate
// surface uses this — never its own "Enabled"/"Draft" chip.

import type { ReactNode } from "react";
import {
  StatusBadge,
  type StatusBadgeSize,
} from "@/components/official/status-badge/StatusBadge";
import { MANDATE_STATUS_META, type MandateStatus } from "./mandate-status";

export function MandateStatusBadge({
  status,
  size = "md",
  trailing,
  className,
}: {
  status: MandateStatus;
  size?: StatusBadgeSize;
  trailing?: ReactNode;
  className?: string;
}) {
  const meta = MANDATE_STATUS_META[status];
  return (
    <StatusBadge
      label={meta.label}
      tone={meta.tone}
      icon={meta.icon}
      size={size}
      title={meta.meaning}
      trailing={trailing}
      className={className}
    />
  );
}
