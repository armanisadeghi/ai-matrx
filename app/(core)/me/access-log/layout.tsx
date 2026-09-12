import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/me/access-log", {
  title: "Who opened my data",
  description:
    "Every time anyone opened your private data under emergency access — and every time someone asked and was refused.",
  letter: "AL",
});

export default function MyAccessLogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
