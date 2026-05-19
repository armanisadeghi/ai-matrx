import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/markdown-studio", {
  title: "Markdown Studio",
  description:
    "Live markdown editor with parser drift analysis — see exactly how every block type is detected and compared across V2, Redux, and the Python server.",
  letter: "MS",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
