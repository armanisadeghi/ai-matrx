import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Email",
  title: "Admin",
  description: "Email template management and delivery configuration",
  letter: "Em",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
