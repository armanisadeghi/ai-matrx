"use client";

// THE HOST APP'S MEET APP PANELS (Meet register MD-15). A meeting carries a panel key + record
// (meet_meetings.metadata.app_panel); the package opens the entry registered here beside the
// call. Each panel is loaded on demand so a meeting without one pays nothing for it.

import dynamic from "next/dynamic";
import type { MeetAppPanelProps, MeetAppPanelRegistry } from "@ai-matrx/meet/react";

const Review360MeetPanel = dynamic<MeetAppPanelProps>(
  () => import("@/features/employee-performance-reviews/review-360/Review360MeetPanel"),
  { ssr: false, loading: () => <div className="h-24 animate-pulse rounded-md bg-card/40" aria-label="Loading the panel" /> },
);

export const MEET_APP_PANELS: MeetAppPanelRegistry = {
  "hr.review_360": { title: "360 review", Component: Review360MeetPanel },
};
