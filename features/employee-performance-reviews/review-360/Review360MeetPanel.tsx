"use client";

// The Meet app panel `hr.review_360` (Meet register MD-15): the 360 review beside the call, on
// the meeting's one shared section focus. Registered by the host app in
// features/meet/app-panels/registry.tsx — nothing about reviews lives in the Meet package.

import type { MeetAppPanelProps } from "@ai-matrx/meet/react";
import { useSharedFocus } from "@ai-matrx/meet/react";

import { toast } from "@/lib/toast";

import { Review360Host } from "./Review360Host";
import { isReview360Section, Review360SideBySide } from "./Review360SideBySide";

export default function Review360MeetPanel({ recordId, organizationId, panelKey }: MeetAppPanelProps) {
  const focus = useSharedFocus(panelKey);
  const section = isReview360Section(focus.section) ? focus.section : "accomplishments";
  return (
    <Review360Host organizationId={organizationId}>
      <Review360SideBySide
        reviewId={recordId}
        organizationId={organizationId}
        section={section}
        movedBy={focus.byName}
        canMove={focus.canMove}
        onSection={(next) =>
          void focus.setSection(next).then((r) => {
            if (!r.ok) toast.error(r.message);
          })
        }
      />
    </Review360Host>
  );
}
