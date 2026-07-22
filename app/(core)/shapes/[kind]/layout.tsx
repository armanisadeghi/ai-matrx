import { createShapeKindMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return createShapeKindMetadata(decodeURIComponent(kind));
}

export default function ShapeKindLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
