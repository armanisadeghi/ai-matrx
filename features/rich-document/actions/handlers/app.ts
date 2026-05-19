// features/rich-document/actions/handlers/app.ts
//
// App-level navigation actions — feedback dialog, announcements, user
// preferences. Not tied to the content itself; just convenient places to
// surface them from any RichDocument overflow menu.

import { Bug, Megaphone, Settings } from "lucide-react";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { registerAction } from "../registry";

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

registerAction({
  id: "announcements",
  label: "Announcements",
  icon: Megaphone,
  iconColor: "text-purple-500 dark:text-purple-400",
  category: "app",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  run: (ctx) => {
    ctx.dispatch(openOverlay({ overlayId: "announcements" }));
  },
});

registerAction({
  id: "preferences",
  label: "Preferences",
  icon: Settings,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "app",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  run: (ctx) => {
    ctx.dispatch(openOverlay({ overlayId: "userPreferences", data: null }));
  },
});
