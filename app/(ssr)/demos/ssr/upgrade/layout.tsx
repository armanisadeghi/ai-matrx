import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/ssr", {
  titlePrefix: "Upgrade",
  title: "Demos",
  description: "Pricing, upgrade nudges, and industry-specific landing surfaces.",
  letter: "Up",
});

export default function DemosUpgradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col pt-10 pb-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-10">
        {children}
      </div>
    </div>
  );
}
