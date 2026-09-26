// features/mandates/status/MandateStatusBadge.tsx
//
// A mandate's status, drawn by THE canonical StatusBadge. Every mandate
// surface uses this — never its own "Enabled"/"Draft" chip.

import {
  StatusBadge,
  type StatusBadgeSize,
} from "@/components/official/status-badge/StatusBadge";
import { MANDATE_STATUS_META, type MandateStatus } from "./mandate-status";

export function MandateStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: MandateStatus;
  size?: StatusBadgeSize;
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
      className={className}
    />
  );
}
