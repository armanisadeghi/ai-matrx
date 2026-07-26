import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Debug",
  title: "Apps",
  description: "Debug tools and admin viewers for custom apps.",
  letter: "Db", // Apps debug
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full bg-textured transition-colors">
      <main className="h-full w-full">{children}</main>
    </div>
  );
}
