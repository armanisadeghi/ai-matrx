// features/bindings/archived-holder.ts
//
// AN ARCHIVED HOLDER IS OFFERED, NEVER DEAD (coordinator ruling on the
// archived-items law, 2026-09-26). The shared pickers keep archived agents and
// workflows one or two clicks away and badge them "Archived". Choosing one in
// the binding picker offers exactly ONE honest action:
//
//   the person may restore it → "Restore and use": restore it as the person,
//                               then bind it;
//   they may not              → "Archived — ask the owner to restore it", with
//                               the request-access primitive.
//
// Pure: the reads and the write live in `ArchivedHolderNotice.tsx`.

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import type { RequestAccessTarget } from "@/features/access-gate/service/requestAccess";

export type HolderKind = "agent" | "workflow";

export interface ArchivedHolderFacts {
  kind: HolderKind;
  id: string;
  name: string | null;
  isArchived: boolean;
  organizationId: string | null;
  organizationName?: string | null;
  /** The access kernel's answer: may the viewer edit it (`canActOn` → `iam.has_access`)? */
  viewerCanEdit: boolean;
}

export type ArchivedHolderOffer =
  | { kind: "none" }
  | { kind: "restore"; label: "Restore and use"; sentence: string }
  | { kind: "ask-owner"; sentence: string; target: RequestAccessTarget };

const NOUN: Record<HolderKind, string> = { agent: "agent", workflow: "workflow" };
const KIND_WORD: Record<HolderKind, string> = { agent: "Agent", workflow: "Workflow" };

export function archivedHolderOffer(facts: ArchivedHolderFacts | null): ArchivedHolderOffer {
  if (!facts || !facts.isArchived) return { kind: "none" };
  const name = facts.name?.trim() || `This ${NOUN[facts.kind]}`;
  // Restoring is an edit of the record: the access kernel decides who may.
  if (facts.viewerCanEdit) {
    return {
      kind: "restore",
      label: "Restore and use",
      sentence: `${name} is archived. Restore it to use it here.`,
    };
  }
  const owner: RequestAccessTarget["owner"] =
    !facts.organizationId || facts.organizationId === SYSTEM_ORGANIZATION_ID
      ? "system"
      : {
          organizationId: facts.organizationId,
          organizationName: facts.organizationName ?? null,
        };
  return {
    kind: "ask-owner",
    sentence: "Archived — ask the owner to restore it.",
    target: {
      action: `Restore this ${NOUN[facts.kind]}`,
      resource: { kind: KIND_WORD[facts.kind], name, type: facts.kind, id: facts.id },
      owner,
    },
  };
}
