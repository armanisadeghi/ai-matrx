import { createShapeKindMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return createShapeKindMetadata(decodeURIComponent(kind), {
    titlePrefix: "Stream",
    description:
      "Replay this shape's exact production stream — loading state, progressive fill, final swap.",
    pathSuffix: "stream",
  });
}

export default function ShapeStreamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
