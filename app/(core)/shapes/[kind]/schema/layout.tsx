import { createShapeKindMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return createShapeKindMetadata(decodeURIComponent(kind), {
    titlePrefix: "Schema",
    description: "Read-only field list and emitted JSON schema for this shape.",
    pathSuffix: "schema",
  });
}

export default function ShapeSchemaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
