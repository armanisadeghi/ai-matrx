"use client";

// features/masterwork/capture-plan/SessionHost.tsx
//
// THE SESSION. One slot of a Capture Plan, opened through the lane's REAL door.
//
// 🚨 THIS PROGRAM HAS NO CAPTURE SURFACE OF ITS OWN, and that is the whole
// design. Every session is an EXISTING lane, rendered from the same component
// its own card renders — the red pen is `RedPenDialog`, the triad game is
// `/masterwork/[id]/triad`, "just talk" is `IngestSourceDialog` on the
// `monologue` lane. A plan that built its own miniature versions of those would
// be a fourteenth capture surface to keep in step with thirteen others, and the
// first one to drift would drift silently.
//
// Two shapes, because the lanes have two shapes:
//
//  * A lane whose door is a DIALOG is mounted here, in place. The Expert never
//    leaves the plan.
//  * A lane whose door is a whole PAGE (the interview, the triad game, the bad
//    example probe) is navigated to, because each of those is minutes of
//    back-and-forth that needs the screen. The plan remembers the session was
//    opened and asks for it when the Expert comes back — it never guesses.
//
// 🚨 AND IT MEASURES BY DIFFING, NOT BY ASKING THE LANE. What a session
// produced is the set of rule ids that appeared in the Rulebook between opening
// and closing it. No lane has to know it is inside a plan, no ingest endpoint
// grows a parameter, and a lane that ships tomorrow is measured identically on
// the day it ships.

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveApproachLane, type ApproachLane } from "../browse/approachLane";
import type { DistillationApproach } from "../browse/approaches";
import { BodyOfWorkDialog } from "../components/detail/BodyOfWorkDialog";
import { ChatImportDialog } from "../components/detail/ChatImportDialog";
import { IngestSourceDialog } from "../components/detail/IngestSourceDialog";
import { MeetingScavengerDialog } from "../components/detail/MeetingScavengerDialog";
import { RedPenDialog } from "../components/detail/RedPenDialog";
import { ShadowInboxDialog } from "../components/detail/ShadowInboxDialog";
import { DailyDripDialog } from "@/features/masterwork/drip/DailyDripDialog";
import { PredictionLedgerDialog } from "../prediction/PredictionLedgerDialog";
import type { Rulebook } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** Where a lane lives, for a host that has to mount it or go to it. */
export type SessionDoor =
  | { kind: "dialog"; lane: ApproachLane }
  | { kind: "page"; href: string }
  /**
   * Never silent. The plan refuses to open a method whose door it cannot find,
   * and the card says which method and why rather than dropping the Expert on
   * a blank screen — the `timeline` census defect, one layer up.
   */
  | { kind: "missing"; why: string };

export function resolveSessionDoor(
  approach: DistillationApproach | undefined,
  rulebookId: string,
): SessionDoor {
  if (!approach) {
    return {
      kind: "missing",
      why: "This method is no longer in the catalog, so the plan cannot open it.",
    };
  }
  const lane = resolveApproachLane(approach);
  if (!lane) {
    return {
      kind: "missing",
      why: "The catalog lists this method but the product has no screen for it.",
    };
  }
  switch (lane.kind) {
    case "interview":
      return { kind: "page", href: `/masterwork/${rulebookId}/interview` };
    case "triad":
      return { kind: "page", href: `/masterwork/${rulebookId}/triad` };
    case "probe":
      return { kind: "page", href: `/masterwork/${rulebookId}/probe` };
    case "teachBack":
      return { kind: "page", href: `/masterwork/${rulebookId}/teach-back` };
    case "sortingTable":
      return { kind: "page", href: `/masterwork/${rulebookId}/sort` };
    case "conduct":
      return { kind: "page", href: `/masterwork/${rulebookId}/conduct` };
    case "href":
      return { kind: "page", href: lane.href };
    case "ingest":
    case "redPen":
    case "meeting":
    case "shadowInbox":
    case "chatImport":
    case "prediction":
    case "drip":
    case "body_of_work":
      return { kind: "dialog", lane };
    case "dump":
    case "unfolding":
    case "plan":
      // Both have postures of their own in `methods.ts` and are never planned;
      // this arm exists so the switch stays total and a future change to that
      // posture cannot fall through silently.
      return {
        kind: "missing",
        why: "A plan does not schedule this method — it is a one-off, not a short repeated session.",
      };
    // A lane kind added after this file was written. NEVER a silent
    // fall-through: the plan says it cannot open this session, and
    // `registry-posture.test.ts` fails the moment a PLANNABLE method lands
    // here.
    //
    // 🚨 `default:` rather than a return AFTER the switch, and the difference
    // matters: once every declared kind is handled, TypeScript proves a
    // trailing return unreachable and refuses to compile it (TS7027, hit
    // 2026-09-15 by adding `drip`). The net would then have to be deleted to
    // build — i.e. the safety arm disappears exactly when the switch is
    // healthiest, and the next new kind falls through silently. A `default`
    // arm is always reachable to the compiler and keeps the net permanently.
    default:
      return {
        kind: "missing",
        why: "This method's screen is newer than the plan's knowledge of it.",
      };
  }
}

export function SessionHost({
  door,
  rulebook,
  canEdit,
  onClosed,
  onProduced,
}: {
  door: SessionDoor;
  rulebook: Rulebook;
  canEdit: boolean;
  /** The Expert shut the lane. The plan asks what it produced. */
  onClosed: () => void;
  /** The lane said it landed something; the plan re-reads the Rulebook. */
  onProduced: () => void;
}) {
  if (door.kind !== "dialog") return null;
  const lane = door.lane;
  const shared = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) onClosed();
    },
    rulebook,
    onIngested: onProduced,
  };

  switch (lane.kind) {
    case "ingest":
      return <IngestSourceDialog {...shared} initialLane={lane.lane} />;
    case "redPen":
      return <RedPenDialog {...shared} />;
    case "meeting":
      return <MeetingScavengerDialog {...shared} />;
    case "shadowInbox":
      return <ShadowInboxDialog {...shared} />;
    case "body_of_work":
      return <BodyOfWorkDialog {...shared} />;
    case "chatImport":
      return <ChatImportDialog {...shared} initialTab={lane.tab} />;
    case "drip":
      return (
        <DailyDripDialog
          open
          onOpenChange={(open) => {
            if (!open) onClosed();
          }}
          rulebook={rulebook}
          canEdit={canEdit}
          onChanged={onProduced}
        />
      );
    case "prediction":
      return (
        <PredictionLedgerDialog
          open
          onOpenChange={(open) => {
            if (!open) onClosed();
          }}
          rulebook={rulebook}
          canEdit={canEdit}
          onChanged={onProduced}
        />
      );
    default:
      return null;
  }
}

/**
 * The button that opens a session. A page lane navigates; a dialog lane asks
 * the parent to mount it; a missing door refuses OUT LOUD and is never a dead
 * control — it is absent, with the reason beside it.
 */
export function OpenSessionButton({
  door,
  label,
  disabled,
  onOpenDialog,
  onNavigating,
}: {
  door: SessionDoor;
  label: string;
  disabled?: boolean;
  onOpenDialog: () => void;
  onNavigating: () => void;
}) {
  const router = useRouter();
  const [going, setGoing] = useState(false);
  const go = useCallback(() => {
    if (door.kind === "dialog") {
      onOpenDialog();
      return;
    }
    if (door.kind === "page") {
      setGoing(true);
      onNavigating();
      router.push(door.href);
    }
  }, [door, onOpenDialog, onNavigating, router]);

  const why = useMemo(
    () => (door.kind === "missing" ? door.why : null),
    [door],
  );

  if (why) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        This session cannot be opened. {why} It will be replaced at the next
        re-plan.
        <ErrorAlchemyMenu error={why} />
      </p>
    );
  }
  return (
    <Button onClick={go} disabled={disabled || going} size="sm">
      {going ? "Opening…" : label}
    </Button>
  );
}
