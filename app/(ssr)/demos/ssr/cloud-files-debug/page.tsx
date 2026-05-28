import { createRouteMetadata } from "@/utils/route-metadata";
import { CloudFilesDebugClient } from "./CloudFilesDebugClient";

export const metadata = createRouteMetadata("/demos/ssr/cloud-files-debug", {
  titlePrefix: "Cloud Files Debug",
  title: "Demo",
  description:
    "Diagnostic harness for the cloud-files API — shows the active backend URL, JWT, and lets you fire individual operations against the Python /files/* backend with full request/response visibility.",
  letter: "CF",
});

export default function CloudFilesDebugPage() {
  return <CloudFilesDebugClient />;
}
