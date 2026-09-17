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
