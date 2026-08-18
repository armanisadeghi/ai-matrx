import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/vision-interview", {
  title: "Vision Interview",
  description:
    "Turn an idea into a clear, build-ready vision through a guided interview.",
  canonicalPath: "/vision-interview",
});

export default function VisionInterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
