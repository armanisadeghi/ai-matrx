import GlassLabClient from "./_components/GlassLabClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/ssr/glass-lab", {
  title: "Glass Lab",
  description:
    "Drag a glass widget across tricky backdrops. Hot-swap between glass theories.",
});

export default function GlassLabPage() {
  return <GlassLabClient />;
}
