import { shapesListMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export const metadata = shapesListMetadata;

export default function ShapesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
