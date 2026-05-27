import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Chat",
  title: "Tests",
  description: "Chat UI and messaging component tests",
  letter: "CT",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="">{children}</div>;
}
