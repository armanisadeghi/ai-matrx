import { createRouteMetadata } from "@/utils/route-metadata";
import AttachResourcesDemo from "./AttachResourcesDemo";

export const metadata = createRouteMetadata("/demos/attach-resources", {
  title: "Attachable connections",
  description:
    "A connection you can choose things out of, beside one you can only connect to — both chip kinds, the attached list, and every honest state of the chooser.",
});

export default function AttachResourcesDemoPage() {
  return <AttachResourcesDemo />;
}
