import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tools/product-capture", {
  title: "Product Capture",
  description:
    "Rapidly photograph products, scan QR codes, and attach notes ahead of listing.",
  letter: "PC",
});

export default function ProductCaptureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
