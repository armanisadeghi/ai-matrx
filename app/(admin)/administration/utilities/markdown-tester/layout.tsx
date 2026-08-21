import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Markdown Tester",
  title: "Admin",
  description: "Test and preview markdown rendering and formatting",
  letter: "MT",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
