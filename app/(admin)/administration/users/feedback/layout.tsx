import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Feedback",
  title: "Admin",
  description: "Review and triage user feedback and bug reports",
  letter: "Fb",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
