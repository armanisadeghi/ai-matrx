import { createRouteMetadata } from "@/utils/route-metadata";
import AttachMenuStudio from "./AttachMenuStudio";

export const metadata = createRouteMetadata("/demos/attach-menu", {
  title: "Attach menu studio",
  description: "Every attach menu and every inside view, numbered, to assemble the one menu.",
});

export default function AttachMenuStudioPage() {
  return <AttachMenuStudio />;
}
