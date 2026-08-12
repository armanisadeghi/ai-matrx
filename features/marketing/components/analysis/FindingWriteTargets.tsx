"use client";

/**
 * FindingWriteTargets — the live handlers for the write half of
 * `matrx-user/marketing-findings` (the targets its manifest declares).
 *
 * The receiving end of the 360 loop on the finding detail route: an agent
 * calls `apply_surface_write("finding_suppression" | "finding_lifecycle_status",
 * value)`, the seam asks the user in place, and the value lands here — through
 * the register's CANONICAL lifecycle writes (`finding-mutations.ts`), the same
 * functions the detail header's "I'm on it" button and the remedy card's
 * suppress dialog call. Never a bespoke path, never a direct DB write.
 *
 * Renders nothing. Mount once inside the DETAIL route's
 * `SurfaceRuntimeProvider` with the loaded finding — deliberately NOT from
 * `FindingsTable`, so the list route mounts the same surface with no handlers
 * and is offered no write tool at all.
 *
 * Handlers validate first and THROW on a bad shape (the seam turns that into
 * the agent's error envelope, with nothing written), and THROW again if the
 * row that comes back does not carry what was asked for — a write that the
 * server quietly did not apply must never be reported as done.
 */

import { useEffect, useRef } from "react";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { MarketingFinding } from "@/features/marketing/data/analysis-types";
import {
  ACKNOWLEDGEABLE_FROM_STATUSES,
  parseFindingStatusWrite,
  parseFindingSuppressionWrite,
} from "@/features/marketing/data/finding-lifecycle";
import {
  acknowledgeFinding,
  reopenFinding,
  suppressFinding,
  unsuppressFinding,
} from "@/features/marketing/data/finding-mutations";

const SURFACE_NAME = "matrx-user/marketing-findings";

export function FindingWriteTargets({
  siteId,
  finding,
  onWritten,
}: {
  siteId: string;
  finding: MarketingFinding;
  /** Invalidate the register's queries so the read twins reflect the write. */
  onWritten: () => Promise<void> | void;
}) {
  // The freshest ROW we KNOW, read through a REF and never through the render
  // closure. Two reasons, both real: the seam resolves a handler BEFORE the
  // user answers the confirm dialog, so the closure's `finding` is a snapshot
  // from before the ask; and when an agent applies BOTH targets in one message
  // the dialogs queue, so the second handler runs before the refetch from the
  // first has landed. Every canonical write RETURNS the fresh row — keep it.
  const rowRef = useRef(finding);
  useEffect(() => {
    if (finding.version >= rowRef.current.version) rowRef.current = finding;
  }, [finding]);

  const settle = async (updated: MarketingFinding) => {
    if (updated.version >= rowRef.current.version) rowRef.current = updated;
    await onWritten();
  };

  useSurfaceWriteHandlers(SURFACE_NAME, {
    finding_suppression: async (value: unknown) => {
      const write = parseFindingSuppressionWrite(value);
      const updated = write.suppressed
        ? await suppressFinding(siteId, finding.id, write.reason as string)
        : await unsuppressFinding(siteId, finding.id);

      // The canonical writes return the row the DB actually holds. Trust that,
      // not the request: an RLS-filtered update or a trigger that rewrote the
      // value would otherwise be reported to the agent as a success.
      if (updated.suppressed !== write.suppressed) {
        throw new Error(
          `finding_suppression did not land — the finding is still ${
            updated.suppressed ? "suppressed" : "not suppressed"
          }.`,
        );
      }
      if (write.suppressed && updated.suppressed_reason !== write.reason) {
        throw new Error(
          "finding_suppression: the suppression reason was not stored as sent.",
        );
      }
      await settle(updated);
    },

    finding_lifecycle_status: async (value: unknown) => {
      const next = parseFindingStatusWrite(value);
      const current = rowRef.current;

      // Transition guards mirroring the page's own controls: the header only
      // offers "I'm on it" while a finding is open or reopened, and undoing an
      // acknowledgement only means anything while it IS acknowledged. Writing
      // over `resolved` from here would overwrite the analyzer's verdict.
      if (next === "acknowledged") {
        if (
          !(ACKNOWLEDGEABLE_FROM_STATUSES as readonly string[]).includes(
            current.status,
          )
        ) {
          throw new Error(
            `finding_lifecycle_status: this finding is ${current.status} — only an open or reopened finding can be acknowledged.`,
          );
        }
      } else if (current.status !== "acknowledged") {
        throw new Error(
          `finding_lifecycle_status: this finding is ${current.status}, not acknowledged — there is no acknowledgement to undo.`,
        );
      }

      const updated =
        next === "acknowledged"
          ? await acknowledgeFinding(siteId, finding.id)
          : await reopenFinding(siteId, finding.id);
      if (updated.status !== next) {
        throw new Error(
          `finding_lifecycle_status did not land — the finding is still ${updated.status}.`,
        );
      }
      await settle(updated);
    },
  });

  return null;
}
