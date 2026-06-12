import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/legal", {
  titlePrefix: "Present Value",
  title: "Utilities",
  description: "Present value calculator for California WC.",
  letter: "Lv",
});

export default function PresentValueUtilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
