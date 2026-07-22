import { shapesAdminMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export const metadata = shapesAdminMetadata;

export default function ShapesAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
