// features/crm/components/outreach-lists/badges.tsx
//
// The ONE place outreach list + member statuses map to visual treatment — the
// list, the detail rollup, and the dialer all render these, so a status can
// never wear two colors.

import { cn } from "@/lib/utils";
import type {
  OutreachListKind,
  OutreachListStatus,
  MemberStatus,
} from "../../outreach-lists/types";

const CAMPAIGN_STATUS_CLASSES: Record<OutreachListStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  paused:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  completed:
    "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  archived: "bg-muted text-muted-foreground border-border",
};

export function ListStatusBadge({ status }: { status: string }) {
  const classes =
    CAMPAIGN_STATUS_CLASSES[status as OutreachListStatus] ??
    "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none",
        classes,
      )}
    >
      {status}
    </span>
  );
}

export function ListKindBadge({ kind }: { kind: string }) {
  const label =
    (
      {
        list: "List",
        email: "Email",
        call: "Calling",
        mixed: "Mixed",
      } as Record<OutreachListKind, string>
    )[kind as OutreachListKind] ?? kind;
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
      {label}
    </span>
  );
}

/** Member statuses grouped by meaning, not enumerated per status. */
const MEMBER_STATUS_TONE: Record<MemberStatus, string> = {
  queued: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  delivered:
    "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  opened: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  clicked:
    "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  replied:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  bounced: "bg-destructive/15 text-destructive border-destructive/20",
  connected:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  voicemail:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  no_answer:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  not_interested: "bg-destructive/15 text-destructive border-destructive/20",
  meeting_booked:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  suppressed: "bg-destructive/15 text-destructive border-destructive/20",
  done: "bg-muted text-muted-foreground border-border",
};

export function MemberStatusBadge({ status }: { status: string }) {
  const classes =
    MEMBER_STATUS_TONE[status as MemberStatus] ??
    "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        classes,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
