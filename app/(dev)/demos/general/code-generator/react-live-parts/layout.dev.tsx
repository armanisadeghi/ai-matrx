import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "React Live Parts",
  title: "Demo",
  description:
    "Composable React Live demo with split panels and partial previews",
  letter: "RLP",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
