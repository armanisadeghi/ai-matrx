import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/dashboard", {
  titlePrefix: "SSR",
  title: "Dashboard",
  description: "SSR dashboard shell and layout experiments",
  letter: "Sd",
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col pt-10">{children}</div>
    </>
  );
}
