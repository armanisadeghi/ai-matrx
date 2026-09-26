// features/rich-document/actions/handlers/app.ts
//
// Feedback on this content — the one "app" action a content menu carries.

import { Bug } from "lucide-react";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { registerAction } from "../provider";

registerAction({
  id: "submit-feedback",
  label: "Submit feedback",
  icon: Bug,
  iconColor: "text-orange-500 dark:text-orange-400",
  category: "app",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  run: (ctx) => {
    ctx.dispatch(openOverlay({ overlayId: "feedbackDialog", data: null }));
  },
});

// Announcements and Preferences are app navigation, not actions on content
// (they read no value here). They live in the user menu only (ALC-15, CONTRACT
// A3; contentActionRegistry and this registry both dropped them).
