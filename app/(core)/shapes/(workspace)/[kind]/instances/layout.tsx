import { createShapeKindMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return createShapeKindMetadata(decodeURIComponent(kind), {
    titlePrefix: "Instances",
    description: "Your saved instances of this shape.",
    pathSuffix: "instances",
  });
}

export default function ShapeInstancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
