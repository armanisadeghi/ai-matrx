import { createShapeKindMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return createShapeKindMetadata(decodeURIComponent(kind), {
    titlePrefix: "Records",
    description: "Every saved record of this shape your organizations hold.",
    pathSuffix: "table",
  });
}

export default function ShapeRecordsTableLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
