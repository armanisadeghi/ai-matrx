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
    titlePrefix: "Test",
    description: "Fill the form and watch this shape render live.",
    pathSuffix: "test",
  });
}

export default function ShapeTestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
