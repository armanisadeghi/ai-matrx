import { createRouteMetadata } from "@/utils/route-metadata";
import AssociationButtonsDemo from "./AssociationButtonsDemo";

export const metadata = createRouteMetadata("/demos/association-buttons", {
  title: "Association buttons",
  description: "Every attach and add-source button set, side by side.",
});

export default function AssociationButtonsDemoPage() {
  return <AssociationButtonsDemo />;
}
