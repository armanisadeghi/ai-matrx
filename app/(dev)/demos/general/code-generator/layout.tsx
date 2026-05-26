import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Code Generator",
  title: "Demo",
  description: "AI code generation and live preview demos",
  letter: "CG",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
