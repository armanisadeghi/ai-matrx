import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Callback Manager",
  title: "Demo",
  description: "Register, trace, and debug service callbacks and handlers",
  letter: "Cb",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
