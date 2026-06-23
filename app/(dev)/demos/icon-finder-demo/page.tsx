import { createRouteMetadata } from "@/utils/route-metadata";
import { IconFinderDemoClient } from "./IconFinderDemoClient";

export const metadata = createRouteMetadata("/demos/icon-finder-demo", {
  titlePrefix: "Icon finder",
  title: "Demo",
  description:
    "Lazy-loaded demos for Lucide icon-picker, applet IconPicker, IconPickerDialog, and IconInputWithValidation",
  letter: "IF",
});

export default function IconFinderDemoPage() {
  return <IconFinderDemoClient />;
}
