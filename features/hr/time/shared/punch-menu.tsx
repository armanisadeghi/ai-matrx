"use client";

/**
 * features/hr/time/shared/punch-menu.tsx — the right-click menu for a `PunchRow`,
 * shared by every surface that renders one (`PunchRegister`, `PunchChain`, the
 * bulk-correction picker in `PunchCorrectionDialog`).
 *
 * 🚨 NO NEW WRITE PATH. Every item here delegates to a door the host already
 * owns (its own `setCorrecting` state, or a route that opens the computed
 * lane) — this module only describes the row and its readable text. See the
 * strict guard at `scripts/check-hr-punch-write-path.ts`: it verifies the DB
 * write path into `hr.punch`, which nothing here touches.
 */

import { Eraser, ExternalLink, PencilLine } from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { hrTimesheetHref, type HrOrgRef } from "@/features/hr/routes";
import { ACTOR_TYPE_LABELS, PUNCH_KIND_LABELS } from "./vocabulary";
import { formatStampedTimeWithZone } from "./format";

import type { PunchRow } from "../api/types";

/** The punch as readable text — the menu's `content` value. */
export function punchMenuContent(punch: PunchRow | null): string {
  if (!punch) return "";
  return [
    `${PUNCH_KIND_LABELS[punch.punchKind]} — ${formatStampedTimeWithZone(punch.occurredAt, punch.tz)}`,
    `Recorded by ${ACTOR_TYPE_LABELS[punch.actorType]}`,
    punch.voidedAt ? `Voided${punch.voidedReason ? `: ${punch.voidedReason}` : ""}` : "Live",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface PunchMenuActions {
  /** Opens the host's existing correction flow for this one punch. */
  onCorrect?: (punch: PunchRow) => void;
  /** Opens the host's existing void flow for this one punch. */
  onVoid?: (punch: PunchRow) => void;
}

/**
 * Builds the shared "This punch" section. A host with no edit authority (a
 * read-only chain, or the register in its read-only lane) omits `onCorrect`/
 * `onVoid` and gets only the door to the computed lane.
 */
export function punchMenuSection(
  punch: PunchRow | null,
  orgRef: HrOrgRef,
  actions: PunchMenuActions = {},
): ContextMenuExtraSection {
  const alreadyVoided = punch?.voidedAt != null;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "punch-open-day",
      label: "Open work day",
      icon: ExternalLink,
      href: punch ? hrTimesheetHref(punch.employmentId, orgRef) : "#",
      disabled: !punch,
      description: !punch ? "Right-click a punch to open it" : undefined,
    },
  ];

  if (actions.onCorrect) {
    items.push({
      kind: "item",
      id: "punch-correct",
      label: "Correct this punch",
      icon: PencilLine,
      disabled: !punch || alreadyVoided,
      description: !punch
        ? "Right-click a punch to correct it"
        : alreadyVoided
          ? "Already voided — the record is closed"
          : undefined,
      onSelect: () => {
        if (punch) actions.onCorrect?.(punch);
      },
    });
  }

  if (actions.onVoid) {
    items.push({
      kind: "item",
      id: "punch-void",
      label: "Void this punch",
      icon: Eraser,
      disabled: !punch || alreadyVoided,
      description: !punch
        ? "Right-click a punch to void it"
        : alreadyVoided
          ? "Already voided — the record is closed"
          : undefined,
      onSelect: () => {
        if (punch) actions.onVoid?.(punch);
      },
    });
  }

  return { id: "hr-punch", label: "This punch", anchor: "after-compare", items };
}
