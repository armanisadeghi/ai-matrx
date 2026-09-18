import { createShapeKindMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  // The App Router already decodes dynamic segment params — decoding again
  // double-decodes a literal `%` in the kind name.
  return createShapeKindMetadata(kind, {
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
