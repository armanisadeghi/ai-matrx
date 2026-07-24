import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "TypeScript Errors",
  title: "Admin",
  description: "TypeScript error tracking and resolution dashboard",
  letter: "TE",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
