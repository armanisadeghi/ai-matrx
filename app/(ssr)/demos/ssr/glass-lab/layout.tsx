import "./glass-lab.css";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/ssr/glass-lab", {
  titlePrefix: "Glass",
  title: "Lab",
  description:
    "Drag a glass widget across tricky backdrops. Hot-swap between glass theories.",
  letter: "GL",
});

export default function GlassLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
