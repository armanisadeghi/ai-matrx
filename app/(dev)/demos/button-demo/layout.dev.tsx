import ButtonRow from "@/features/ssr-trials/components/button-demo/ButtonRow";
import AddFilterSearchRow from "@/features/ssr-trials/components/button-demo/AddFilterSearchRow";
import AllButtonsShowcase from "@/features/ssr-trials/components/button-demo/AllButtonsShowcase";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Button",
  title: "Demo",
  description: "SSR button rows, filters, and showcase trials",
  letter: "BX",
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex justify-center">
        <AddFilterSearchRow />
      </div>

      <div className="mt-16">
        <ButtonRow />
      </div>

      <div className="mt-12">
        <AllButtonsShowcase />
      </div>

      <div className="flex flex-col pt-16">{children}</div>
    </>
  );
}
