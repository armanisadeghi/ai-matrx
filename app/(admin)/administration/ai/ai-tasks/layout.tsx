import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "AI Tasks",
  title: "Admin",
  description: "Manage and monitor AI background tasks and job queues",
  letter: "AT",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
