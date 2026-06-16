// features/rich-document/actions/handlers/stubs.ts
//
// "Coming soon" placeholder actions. Kept in the registry so the UI slots
// stay consistent across surfaces while we build the real implementations.

import { Briefcase } from "lucide-react";
import { toast } from "sonner";
import { registerAction } from "../registry";

registerAction({
  id: "convert-to-broker",
  label: "Convert to broker",
  icon: Briefcase,
  iconColor: "text-amber-500 dark:text-amber-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 20,
  run: () => {
    toast.info("Coming soon", {
      description: "Convert to broker will be available shortly.",
    });
  },
});
