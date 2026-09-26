// features/mandates/member-list/types.ts
//
// One row of the NON-ADMIN mandate list — the user list (/mandates/list-preview)
// and the organization list (/organizations/<org>/mandates). Every field comes
// from `public.mnd_member_list` (migrations/mnd_member_list_server_read_2026_09_25.sql)
// and describes the job FROM THE VIEWER'S SEAT: the holder is the one that runs
// it for me (person) or for every member (organization). No admin-only fact
// (code declarations, coverage, grades, other people's customizations) exists
// on this row.

import type { MandateStatus } from "@/features/mandates/status/mandate-status";

/** Which seat the list answers from. The admin seat is ../admin-list. */
export type MandateListLevel = "person" | "organization";

export interface MandateMemberRow {
  id: string;
  mandateKey: string;
  name: string;
  featureLabel: string;
  goal: string | null;
  createdByMe: boolean;
  organizationId: string | null;
  isSystem: boolean;
  /** "System", "Personal", or the home organization's name. */
  homeLabel: string;
  /** "agent" | "workflow" | null when nothing runs it. */
  holderType: string | null;
  holderId: string | null;
  /** The agent/workflow that runs it from this seat, "None" when nothing does. */
  holderName: string;
  /** "You", the organization's name, "Default", or "Nobody". */
  decidedBy: string;
  decidedRung: "user" | "org" | "system" | null;
  /** "Latest", "v3", or "None". */
  pinText: string;
  /** "Default", the names of my organizations that bind it, "Personal". */
  customizedBy: string[];
  health: string;
  origin: "code" | "soft";
  /** platform.visibility: personal | internal | link | public. */
  visibility: string;
  isEnabled: boolean;
  /** THE status from this seat (features/mandates/status/mandate-status.ts). */
  status: MandateStatus;
  updatedAt: string | null;
  createdAt: string | null;
}
