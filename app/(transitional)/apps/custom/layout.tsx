import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Custom",
  title: "Apps",
  description: "Published custom Matrx applications and applets.",
  letter: "Cu", // Custom apps root
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full bg-textured transition-colors">
      <main className="h-full w-full">{children}</main>
    </div>
  );
}
